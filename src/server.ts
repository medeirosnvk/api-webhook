import https from "https";
import dotenv from "dotenv";
import express from "express";
import type { Request, Response } from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import {
  LogEntry,
  PixRecebido,
  SantanderPayment,
  SantanderPixNotification,
} from "./types/querieTypes";
import {
  atualizarWebhook,
  buscarIdPromessa,
  buscarPromessaPix,
  inserirComprovante,
  inserirHistorico,
  inserirHistoricoPix,
  inserirWebhook,
  inserirWebhookPix,
} from "./services/queries";

dotenv.config();

if (!process.env.PORT) {
  throw new Error("PORT is not defined in environment variables");
}

const app = express();
const port = process.env.PORT;

app.use(express.json());
app.use(bodyParser.json());

const logsDir = "logs";
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const getLogFilePath = (date: string): string =>
  path.join(logsDir, date, "logs.json");

const todayStr = (): string => new Date().toISOString().slice(0, 10);

const saveLog = (data: any): void => {
  try {
    const date = todayStr();
    const filePath = getLogFilePath(date);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    let logs: LogEntry[] = [];
    if (fs.existsSync(filePath)) {
      const fileData = fs.readFileSync(filePath, "utf8");
      logs = fileData ? JSON.parse(fileData) : [];
    }
    logs.push({ timestamp: new Date().toISOString(), data });
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error("Erro ao salvar log:", error);
  }
};

const processarPixRecebido = async (pix: PixRecebido): Promise<void> => {
  const { endToEndId, txid, valor, horario, devolucoes } = pix;

  if (devolucoes && devolucoes.length > 0) {
    console.log("ℹ️ Notificação de devolução PIX ignorada:", txid);
    return;
  }

  const inserirNovoWebhook = await inserirWebhookPix({
    endToEndId,
    txid,
    valor,
    horario,
  });

  // INSERT ignore + UNIQUE(txid): notificação repetida não é reprocessada.
  if (!inserirNovoWebhook || inserirNovoWebhook.affectedRows === 0) {
    console.log("ℹ️ Webhook PIX já registrado para o txid:", txid);
    return;
  }

  console.log("✏️ Novo webhook PIX inserido no banco.");

  const promessaResult = await buscarPromessaPix(txid);

  if (!promessaResult || promessaResult.length === 0) {
    console.warn("⚠️ Nenhuma promessa_pix encontrada para o txid:", txid);
    return;
  }

  const { idpromessa, iddevedor } = promessaResult[0];
  console.log("🔍 idpromessa encontrado:", idpromessa);

  await inserirComprovante(idpromessa);
  console.log("✏️ Novo comprovante PIX inserido no banco.");

  await inserirHistoricoPix(iddevedor, txid);
  console.log("✏️ Novo historico PIX inserido no banco.");
};

// Santander não reenvia a notificação e considera arriscado responder em mais
// de 1s, então respondemos 200 antes de processar.
const receberWebhookPix = async (req: Request, res: Response) => {
  const data: SantanderPixNotification = req.body;
  saveLog(data);
  console.log("Recebido pelo webhook PIX:", JSON.stringify(data, null, 2));

  res.status(200).json({ message: "Notificação PIX recebida." });

  if (!Array.isArray(data?.pix)) {
    console.log("ℹ️ Payload PIX sem lista 'pix' — provável validação de URL.");
    return;
  }

  for (const pix of data.pix) {
    try {
      await processarPixRecebido(pix);
    } catch (error) {
      console.error("❌ Erro ao processar PIX txid:", pix?.txid, error);
    }
  }
};

// Padrão BACEN: o PSP acrescenta "/pix" à URL cadastrada.
app.post("/webhook/pix", receberWebhookPix);

app.get("/webhook/pix", (_req: Request, res: Response) => {
  return res.status(200).json({ message: "Webhook PIX ativo." });
});

app.post("/webhook", async (req: Request, res: Response) => {
  if (Array.isArray(req.body?.pix)) {
    return receberWebhookPix(req, res);
  }

  const data: SantanderPayment = req.body;
  saveLog(data);
  console.log("Recebido pelo webhook:", JSON.stringify(data, null, 2));

  const { participantCode, txId, payedValue, paymentDate, clientNumber } = data;

  if (participantCode === undefined || participantCode === null) {
    console.log("ℹ️ Payload sem participantCode — provável validação de URL.");
    return res.status(200).json({
      message: "Webhook ativo. Payload de validação recebido.",
    });
  }

  const iddevedor = clientNumber;
  const idboleto = participantCode;

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

    // Atualiza o status do devedor ANTES de inserir histórico para evitar
    // deadlock entre o UPDATE em devedor e o INSERT em historico (FK em iddevedor).
    await atualizarWebhook(participantCode);
    console.log("✏️ Novo webhook atualizado no banco.");

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

app.get("/webhook", async (req: Request, res: Response) => {
  const data: SantanderPayment = req.body;
  saveLog(data);
  console.log("Recebido pelo webhook:", JSON.stringify(data, null, 2));

  const { participantCode, txId, payedValue, paymentDate, clientNumber } = data;

  if (participantCode === undefined || participantCode === null) {
    console.log("ℹ️ Payload sem participantCode — provável validação de URL.");
    return res.status(200).json({
      message: "Webhook ativo. Payload de validação recebido.",
    });
  }

  const iddevedor = clientNumber;
  const idboleto = participantCode;

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

    // Atualiza o status do devedor ANTES de inserir histórico para evitar
    // deadlock entre o UPDATE em devedor e o INSERT em historico (FK em iddevedor).
    await atualizarWebhook(participantCode);
    console.log("✏️ Novo webhook atualizado no banco.");

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

app.get("/webhook/logs", (req: Request, res: Response) => {
  try {
    const dateParam = req.query.date as string | undefined;

    if (dateParam && !dateRegex.test(dateParam)) {
      return res
        .status(400)
        .json({ error: "Parâmetro 'date' inválido. Use o formato YYYY-MM-DD." });
    }

    if (!fs.existsSync(logsDir)) {
      return res.status(200).json([]);
    }

    if (dateParam) {
      const filePath = getLogFilePath(dateParam);
      if (!fs.existsSync(filePath)) {
        return res.status(200).json([]);
      }
      const logs = fs.readFileSync(filePath, "utf8");
      return res.status(200).json(logs ? JSON.parse(logs) : []);
    }

    const dates = fs
      .readdirSync(logsDir)
      .filter((entry) => dateRegex.test(entry))
      .sort();
    const all: LogEntry[] = [];
    for (const date of dates) {
      const filePath = getLogFilePath(date);
      if (!fs.existsSync(filePath)) continue;
      const fileData = fs.readFileSync(filePath, "utf8");
      if (fileData) all.push(...JSON.parse(fileData));
    }
    return res.status(200).json(all);
  } catch (error) {
    console.error("Erro ao ler logs:", error);
    return res.status(500).json({ error: "Erro ao ler os logs" });
  }
});

app.listen(port, () => {
  console.log(`Servidor HTTPS rodando em https://191.101.70.186:${port}`);
});
