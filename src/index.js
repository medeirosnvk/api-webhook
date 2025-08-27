const https = require("https");
const dotenv = require("dotenv");
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");

dotenv.config();

const app = express();
const port = process.env.PORT;

app.use(express.json());
app.use(bodyParser.json());

const logFilePath = "logs.json";

const saveLog = (data) => {
  try {
    let logs = [];
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

app.post("/webhook", (req, res) => {
  const data = req.body;

  console.log("➡️  Requisição recebida no /webhook");
  console.log("📌 URL original:", req.originalUrl);
  console.log("📦 Body recebido:", JSON.stringify(req.body, null, 2));

  try {
    const postData = JSON.stringify(data);

    const options = {
      hostname: "cobrance.com.br",
      path: "/santander2/webhook_boleto.php",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    console.log("🌍 Preparando envio para servidor externo...");
    console.log("🔗 Host:", options.hostname);
    console.log("📍 Path:", options.path);
    console.log("⚡ Método:", options.method);
    console.log("📏 Tamanho Body:", options.headers["Content-Length"]);
    console.log("📤 Body a ser enviado:", postData);

    const request = https.request(options, (response) => {
      console.log("✅ Conexão estabelecida com servidor externo");
      console.log("📊 Status Code:", response.statusCode);
      console.log("📋 Headers resposta:", response.headers);

      let responseData = "";

      response.on("data", (chunk) => {
        console.log("📡 Recebendo chunk de dados:", chunk.toString());
        responseData += chunk;
      });

      response.on("end", () => {
        console.log("🏁 Resposta completa recebida do servidor externo");
        console.log("📝 Conteúdo da resposta:", responseData);
        res.status(200).json({ message: "Dados enviados com sucesso" });
      });
    });

    request.on("socket", (socket) => {
      socket.on("lookup", (err, address, family, host) => {
        console.log(
          "🔎 Resolvendo DNS:",
          host,
          "->",
          address,
          "família:",
          family
        );
        if (err) console.error("❌ Erro na resolução de DNS:", err);
      });

      socket.on("connect", () => {
        console.log("🔌 Socket conectado com", options.hostname);
      });

      socket.on("error", (err) => {
        console.error("⚠️ Erro no socket:", err);
      });
    });

    request.on("error", (error) => {
      console.error("❌ Erro ao tentar enviar:", error.message);
      console.error("📡 Detalhes do erro:", error);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: "Erro ao enviar os dados para cobrance.com.br" });
      }
    });

    request.write(postData);
    request.end();
  } catch (error) {
    console.error("🔥 Erro ao processar a requisição local:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Erro ao processar a requisição" });
    }
  }
});

app.get("/logs", (req, res) => {
  try {
    if (fs.existsSync(logFilePath)) {
      const logs = fs.readFileSync(logFilePath, "utf8");
      return res.status(200).json(JSON.parse(logs));
    }
    res.status(200).json([]);
  } catch (error) {
    console.error("Erro ao ler logs:", error);
    res.status(500).json({ error: "Erro ao ler os logs" });
  }
});

app.listen(port, () => {
  console.log(`Servidor HTTPS rodando em https://191.101.70.186:${port}`);
});
