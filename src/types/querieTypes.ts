export interface WebhookSantander {
  idboleto: number;
  txid: string;
  valor: number;
  horario: string;
}

export interface WebhookPixSantander {
  endToEndId: string;
  txid: string;
  valor: string;
  horario: string;
}

export type PixDevolucao = {
  rtrId: string;
  id: string;
  valor: string;
  horario: { solicitacao: string; liquidacao?: string };
  status: string;
  motivo?: string;
};

export type PixRecebido = {
  endToEndId: string;
  txid: string;
  valor: string;
  horario: string;
  infoPagador?: string;
  devolucoes?: PixDevolucao[];
};

export type SantanderPixNotification = {
  pix: PixRecebido[];
};

export interface LogEntry {
  timestamp: string;
  data: any;
}

export type SantanderPayment = {
  message: string;
  function: string;
  paymentType: string;
  issueDate: string;
  paymentDate: string;
  bankCode: string;
  paymentChannel: string;
  paymentKind: string;
  covenant: string;
  typeOfPersonAgreement: string;
  agreementDocument: string;
  bankNumber: string;
  clientNumber: number;
  participantCode: number;
  txId: string;
  payerDocumentType: string;
  payerDocumentNumber: string;
  payerName: string;
  finalBeneficiaryrDocumentType: string;
  finalBeneficiaryDocumentNumber: string;
  finalBeneficiaryName: string;
  dueDate: string;
  nominalValue: number;
  payedValue: number;
  interestValue: number;
  fine: number;
  deductionValue: number;
  rebateValue: number;
  iofValue: number;
};
