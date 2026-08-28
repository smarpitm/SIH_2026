export interface InspectionPassEvent {
  applicationId: string;
  instrumentId: string;
  reportId: string;
  inspectorId: string;
  inspectorKind: "LMO" | "GATC";
}

export type InspectionPassHandler = (e: InspectionPassEvent) => Promise<void>;

const handlers: InspectionPassHandler[] = [];

export function registerInspectionPassHandler(h: InspectionPassHandler) {
  handlers.push(h);
}

export async function emitInspectionPass(e: InspectionPassEvent) {
  await Promise.allSettled(handlers.map((h) => h(e)));
}