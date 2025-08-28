import { WebhookSantander } from "../types/querieTypes";
import { executeQueryNew } from "../database/dbConfig";

export const inserirWebhook = async (
  data: WebhookSantander
): Promise<any[]> => {
  const { idboleto, txid, valor, horario } = data;

  const query = `
    INSERT ignore INTO webhook_santander (
      idboleto,
      endToEndId,
      txid,
      valor,
      horario
      )
    VALUES (
      ?,
      "",
      ?,
      ?,
      ?
    )
  `;

  const results = await executeQueryNew(query, [
    idboleto,
    txid,
    valor,
    horario,
  ]);

  return results;
};

export const atualizarWebhookPix = async (txid: string): Promise<any[]> => {
  const query = `
    UPDATE
      webhook_santander ws,
      qrcode b,
      acordo a,
      promessa p,
      devedor d,
      promessa_pix pp
    SET
      d.idstatus = 1654
    WHERE
      pp.txid = ws.txid
      and pp.idpromessa = p.idpromessa
      and b.iddevedor = d.iddevedor
      and p.idacordo = a.idacordo
      and a.boletagem > 0
      and b.idlote > 0
      and d.idstatus <> 1654
      and ws.txid = ?
  `;

  const results = await executeQueryNew(query, [txid]);

  return results;
};

export const atualizarWebhook = async (idboleto: number): Promise<any[]> => {
  const query = `
    UPDATE 
      webhook_santander ws,
      boleto b,
      acordo a,
      promessa p,
      devedor d
    SET
      d.idstatus = 1654
    WHERE
      b.idboleto = ws.idboleto
      and b.iddevedor = d.iddevedor
      and p.idacordo = a.idacordo
      and p.idboleto = b.idboleto
      and a.boletagem > 0
      and b.idlote > 0
      and d.idstatus <> 1654
      and b.idboleto = ?
  `;

  const results = await executeQueryNew(query, [idboleto]);

  return results;
};

export const buscarIdPromessa = async (idboleto: number): Promise<number> => {
  const query = `
    SELECT 
      idpromessa,
      iddevedor
    FROM
      promessa p
    WHERE
      idboleto = ?
  `;

  const results = await executeQueryNew(query, [idboleto]);

  return results;
};

export const inserirComprovante = async (
  idpromessa: number
): Promise<any[]> => {
  const query = `
    INSERT ignore INTO comprovante_recebido (
      idpromessa,
      idresponsavel
    )
    VALUES (
      ?,
      2144
    )
  `;

  const results = await executeQueryNew(query, [idpromessa]);

  return results;
};

export const inserirHistorico = async (
  iddevedor: number,
  idboleto: number
): Promise<any[]> => {
  const query = `
    INSERT INTO historico (
      idresponsavel,
      iddevedor,
      historico,
      responsavel,
      inclusao,
      horaincl,
      ramal
    )
    VALUES (
      2144,
      CAST(? AS UNSIGNED),
      CONCAT('BANCO SANTANDER INFORMA PAGAMENTO DO BOLETO Nº ', ?, '.'),
      'WEBHOOK',
      curdate(),
      curtime(),
      0
    )
  `;

  const results = await executeQueryNew(query, [iddevedor, idboleto]);

  return results;
};
