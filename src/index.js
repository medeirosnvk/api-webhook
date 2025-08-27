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
