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
        "Content-Length": postData.length,
      },
    };

    const request = https.request(options, (response) => {
      console.log(`statusCode: ${response.statusCode}`);

      response.on("data", (d) => {
        process.stdout.write(d);
      });
    });

    request.on("error", (error) => {
      console.error(error);
      res
        .status(500)
        .json({ error: "Erro ao enviar os dados para cobrance.com.br" });
    });

    request.write(postData);
    request.end();

    res.status(200).json();
  } catch (error) {
    console.error("Erro ao enviar os dados para cobrance.com.br:", error);
    res
      .status(500)
      .json({ error: "Erro ao enviar os dados para cobrance.com.br" });
  }
});

app.listen(port, () => {
  console.log(`Servidor HTTPS rodando em https://191.101.70.186:${port}`);
});
