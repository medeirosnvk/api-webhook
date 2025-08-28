module.exports = {
  apps: [
    {
      name: "api-santander",
      script: "yarn",
      args: "start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
      pre_deploy: {
        pre: "yarn install --production=false && yarn build",
      },
    },
  ],
};
