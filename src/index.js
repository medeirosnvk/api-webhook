const https = require("https");
const dotenv = require("dotenv");
const express = require("express");
const bodyParser = require("body-parser");

dotenv.config();

const app = express();
const port = process.env.PORT;

app.use(express.json());
app.use(bodyParser.json());

app.post("/webhook", (req, res) => {
  const data = req.body;

  console.log(req.originalUrl);
  console.log(req.body);

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

app.listen(port, () => {
  console.log(`Servidor HTTPS rodando em https://191.101.70.186:${port}`);
});
