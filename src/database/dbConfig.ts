import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { Pool, PoolOptions } from "mysql2/promise";

dotenv.config();

if (
  !process.env.MY_SQL_HOST ||
  !process.env.MY_SQL_USER ||
  !process.env.MY_SQL_PASSWORD ||
  !process.env.MY_SQL_DATABASE
) {
  throw new Error("Database configuration variables are not properly defined");
}

let defaultPool: Pool = mysql.createPool({
  host: process.env.MY_SQL_HOST,
  user: process.env.MY_SQL_USER,
  password: process.env.MY_SQL_PASSWORD,
  database: process.env.MY_SQL_DATABASE,
  connectionLimit: parseInt(process.env.MY_SQL_CONNECTION_LIMIT || "10"),
  charset: process.env.MY_SQL_CHARSET,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  idleTimeout: 60000,
});

export async function executeQueryNew(
  query: string,
  params: any[] = [],
  customConfig?: PoolOptions
): Promise<any> {
  const poolToUse: Pool = customConfig
    ? mysql.createPool({ ...customConfig })
    : defaultPool;

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const [rows] = await poolToUse.execute(query, params);
      return rows;
    } catch (error: any) {
      const isDeadlock =
        error?.code === "ER_LOCK_DEADLOCK" || error?.errno === 1213;
      const isConnectionLost =
        error?.code === "PROTOCOL_CONNECTION_LOST" ||
        error?.code === "ECONNRESET" ||
        error?.code === "ETIMEDOUT" ||
        error?.fatal === true;
      const shouldRetry = isDeadlock || isConnectionLost;
      if (shouldRetry && attempt < maxAttempts) {
        const backoff = 100 * attempt + Math.floor(Math.random() * 100);
        console.warn(
          `Erro recuperável (${error?.code}) na tentativa ${attempt}/${maxAttempts}. Retentando em ${backoff}ms...`
        );
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      console.error("Erro ao executar consulta:", error);
      throw error;
    }
  }
}
