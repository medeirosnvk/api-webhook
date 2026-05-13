import https from "https";
import dotenv from "dotenv";
import express from "express";
import type { Request, Response } from "express";
import bodyParser from "body-parser";
import fs from "fs";
import { LogEntry, SantanderPayment } from "./types/querieTypes";
import {
  atualizarWebhook,
  atualizarWebhookPix,
  buscarIdPromessa,
  inserirComprovante,
  inserirHistorico,
  inserirWebhook,
} from "./services/queries";

dotenv.config();

if (!process.env.PORT) {
  throw new Error("PORT is not defined in environment variables");
}

const app = express();
const port = process.env.PORT;

app.use(express.json());
app.use(bodyParser.json());

const logFilePath = "logs.json";

const saveLog = (data: any): void => {
  try {
    let logs: LogEntry[] = [];
    if (fs.existsSync(logFilePath)) {
      const fileData = fs.readFileSync(logFilePath, "utf8");
      logs = fileData ? JSON.parse(fileData) : [];
    }
    logs.push({ timestamp: new Date().toISOString(), data });
    fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error("Erro ao salvar log:", error);
  }
};

app.post("/webhook", async (req: Request, res: Response) => {
  const data: SantanderPayment = req.body;
  saveLog(data);
  console.log("Recebido pelo webhook:", JSON.stringify(data, null, 2));

  const { participantCode, txId, payedValue, paymentDate, clientNumber } = data;
  const iddevedor = clientNumber;
  const idboleto = participantCode;
  const txIdPix = txId ? txId.substring(0, 3) : ""; // revisar
  console.log("Tipo de pagamento identificado:", txIdPix);

  try {
    const inserirNovoWebhook = await inserirWebhook({
      idboleto,
      txid: txId,
      valor: payedValue,
      horario: paymentDate,
    });

    if (
      !inserirNovoWebhook ||
      inserirNovoWebhook === null ||
      inserirNovoWebhook === undefined
    ) {
      console.error("❌ Erro ao tentar inserir webhook no banco de dados.");
      return res
        .status(500)
        .json({ error: "Erro ao tentar inserir webhook no banco de dados." });
    }

    console.log("✏️ Novo webhook inserido no banco.");

    const idPromessaResult = await buscarIdPromessa(idboleto);

    if (!idPromessaResult || idPromessaResult.length === 0) {
      console.warn(
        "⚠️ Nenhuma promessa encontrada para o idboleto:",
        idboleto,
      );
      return res.status(200).json({
        message: "Webhook recebido, mas não há promessa associada ao idboleto.",
      });
    }

    const { idpromessa } = idPromessaResult[0];
    console.log("🔍 idpromessa encontrado:", idpromessa);

    if (!idpromessa || idpromessa === 0) {
      console.warn(
        "⚠️ idpromessa inválido para o idboleto:",
        idboleto,
      );
      return res.status(200).json({
        message: "Webhook recebido, mas idpromessa é inválido.",
      });
    }

    await inserirComprovante(idpromessa);
    console.log("✏️ Novo comprovante inserido no banco.");

    // NAO TEM idboleto NO PIX
    // Atualiza o status do devedor ANTES de inserir histórico para evitar
    // deadlock entre o UPDATE em devedor e o INSERT em historico (FK em iddevedor).
    if (txIdPix === "PIX") {
      await atualizarWebhookPix(txId);
      console.log("✏️ Novo webhook PIX atualizado no banco.");
    } else {
      await atualizarWebhook(participantCode);
      console.log("✏️ Novo webhook atualizado no banco.");
    }

    await inserirHistorico(iddevedor, idboleto);
    console.log("✏️ Novo historico inserido no banco.");

    console.log("✅ Processamento do webhook concluído com sucesso!");
    return res.status(200).json({
      message: "Processamento do webhook concluído com sucesso.",
    });
  } catch (error) {
    console.error("❌ Erro ao processar o webhook:", error);
    return res.status(500).json({ error: "Erro ao processar o webhook" });
  }
});

app.post("/webhook-old", (req: Request, res: Response) => {
  const data = req.body;

  // saveLog(data);

  try {
    const postData = JSON.stringify(data, null, 2);
    console.log(postData);

    const options = {
      hostname: "cobrance.com.br",
      path: "/santander2/webhook_boleto.php",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const request = https.request(options, (response) => {
      let responseData = "";

      response.on("data", (chunk) => {
        responseData += chunk;
      });

      response.on("end", () => {
        console.log(`Resposta do servidor externo: ${responseData}`);
        res.status(200).json({ message: "Dados enviados com sucesso" });
      });
    });

    request.on("error", (error) => {
      console.error(error);

      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: "Erro ao enviar os dados para cobrance.com.br" });
      }
    });

    request.write(postData);
    request.end();
  } catch (error) {
    console.error("Erro ao processar a requisição:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Erro ao processar a requisição" });
    }
  }
});

app.get("/webhook/logs", (_req: Request, res: Response) => {
  try {
    if (fs.existsSync(logFilePath)) {
      const logs = fs.readFileSync(logFilePath, "utf8");
      return res.status(200).json(JSON.parse(logs));
    } else {
      return res.status(200).json([]);
    }
  } catch (error) {
    console.error("Erro ao ler logs:", error);
    return res.status(500).json({ error: "Erro ao ler os logs" });
  }
});

app.listen(port, () => {
  console.log(`Servidor HTTPS rodando em https://191.101.70.186:${port}`);
});
