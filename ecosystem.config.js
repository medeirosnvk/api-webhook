module.exports = {
  apps: [
    {
      name: "app-santander",
      script: "yarn",
      args: "dev",
      watch: true,
      interpreter: "/bin/bash", // Caminho do interpretador
    },
  ],
};
