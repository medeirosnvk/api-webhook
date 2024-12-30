const https = require("https");
const dotenv = require("dotenv");
const express = require("express");

dotenv.config();

const app = express();
const port = process.env.PORT;

app.use(express.json()); // Express já suporta JSON nativamente, não é necessário body-parser.

// Rota principal do webhook
app.post("/webhook", (req, res) => {
  const data = req.body;

  console.log("URL original:", req.originalUrl);
  console.log("Dados recebidos:", data);

  try {
    const postData = JSON.stringify(data);

    const options = {
      hostname: "cobrance.com.br",
      path: "/santander2/webhook_boleto.php",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData), // Melhor uso do Buffer para garantir o tamanho correto
      },
    };

    // Solicitação HTTPS para servidor externo
    const request = https.request(options, (response) => {
      console.log(`Status do servidor externo: ${response.statusCode}`);

      let responseBody = "";

      // Coletar os dados recebidos do servidor externo
      response.on("data", (chunk) => {
        responseBody += chunk;
      });

      response.on("end", () => {
        console.log("Resposta completa do servidor externo:", responseBody);

        if (response.statusCode >= 200 && response.statusCode < 300) {
          return res
            .status(200)
            .json({ message: "Sucesso ao enviar os dados." });
        } else {
          console.error("Erro na resposta do servidor externo:", responseBody);
          return res.status(500).json({
            error: "Erro na comunicação com o servidor externo",
            details: responseBody,
          });
        }
      });
    });

    // Tratar erros de conexão com o servidor externo
    request.on("error", (error) => {
      console.error("Erro ao conectar com o servidor externo:", error);
      if (!res.headersSent) {
        return res.status(500).json({
          error: "Erro ao enviar os dados para cobrance.com.br",
          details: error.message,
        });
      }
    });

    request.write(postData); // Enviar os dados para o servidor externo
    request.end();
  } catch (error) {
    console.error("Erro no processamento do webhook:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Erro interno no servidor",
        details: error.message,
      });
    }
  }
});

// Iniciar o servidor
app.listen(port, () => {
  console.log(
    `Servidor HTTPS rodando em https://santander.cobrance.online:${port}`
  );
});
