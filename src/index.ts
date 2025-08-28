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

app.post("/webhook", (req: Request, res: Response) => {
  const data: SantanderPayment = req.body;
  console.log("Recebido pelo webhook:", JSON.stringify(data, null, 2));

  const { participantCode, txId, payedValue, paymentDate } = data;
  const txIdPix = txId ? txId.substring(3) : "";
  console.log("Tipo de pagamento identificado:", txIdPix);

  try {
    const inserirNovoWebhook = inserirWebhook({
      idboleto: participantCode,
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

    console.log("✏️ Novo webhook inserido no banco:", inserirNovoWebhook);

    if (txIdPix === "PIX") {
      const atualizarNovoWebhookPix = atualizarWebhookPix(txId);
      console.log(
        "✏️ Novo webhook PIX atualizado no banco:",
        atualizarNovoWebhookPix
      );
    } else {
      const atualizarNovoWebhook = atualizarWebhook(participantCode);
      console.log("✏️ Novo webhook atualizado no banco:", atualizarNovoWebhook);
    }

    console.log("✅ Processamento do webhook concluído com sucesso.");
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

app.get("/logs", (_req: Request, res: Response) => {
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
