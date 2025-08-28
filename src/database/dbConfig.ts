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
  connectTimeout: 3600000,
});

export async function executeQueryNew(
  query: string,
  params: any[] = [],
  customConfig?: PoolOptions
): Promise<any> {
  let poolToUse: Pool;

  if (customConfig) {
    poolToUse = mysql.createPool({
      ...customConfig,
    });
  } else {
    poolToUse = defaultPool;
  }

  try {
    const [rows] = await poolToUse.execute(query, params);
    return rows;
  } catch (error) {
    console.error("Erro ao executar consulta:", error);
    throw error;
  }
}
