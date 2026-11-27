export type PlayerEngine = 'HLS.js' | 'MPEG-TS' | 'HTML5' | 'Sconosciuto';

export type PlayerStatus =
  | 'In avvio'
  | 'In riproduzione'
  | 'In pausa'
  | 'Buffering'
  | 'Errore'
  | 'Fermato';

export interface PlayerDiagnostics {
  engine: PlayerEngine;
  status: PlayerStatus;
  startupTimeMs: number | null;
  bufferingEvents: number;
  bufferingTimeMs: number;
  fallbackAttempts: number;
  errors: string[];
  sessionStartedAt: number | null;
}

export const createInitialDiagnostics = (): PlayerDiagnostics => ({
  engine: 'Sconosciuto',
  status: 'In avvio',
  startupTimeMs: null,
  bufferingEvents: 0,
  bufferingTimeMs: 0,
  fallbackAttempts: 0,
  errors: [],
  sessionStartedAt: null,
});

export const sanitizePlayerDiagnosticMessage = (message: string): string => message
  .replace(/https?:\/\/[^\s]+/gi, '[URL rimosso]')
  .replace(/([?&](?:token|username|password|auth|authorization|key)=)[^&\s]+/gi, '$1[redatto]');

const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes} min ${seconds} sec`
    : `${seconds} sec`;
};

export const formatPlayerDiagnostics = (
  diagnostics: PlayerDiagnostics
): string => {
  const startup = diagnostics.startupTimeMs === null
    ? 'Non disponibile'
    : `${(diagnostics.startupTimeMs / 1000).toFixed(2)} sec`;

  const errors = diagnostics.errors.length > 0
    ? diagnostics.errors.map((error, index) => `${index + 1}. ${sanitizePlayerDiagnosticMessage(error)}`).join('\n')
    : 'Nessun errore registrato';

  return [
    'STREAMIX - DIAGNOSTICA PLAYER',
    '--------------------------------',
    `Motore: ${diagnostics.engine}`,
    `Stato: ${diagnostics.status}`,
    `Tempo di avvio: ${startup}`,
    `Eventi di buffering: ${diagnostics.bufferingEvents}`,
    `Tempo totale di buffering: ${formatDuration(diagnostics.bufferingTimeMs)}`,
    `Tentativi di fallback: ${diagnostics.fallbackAttempts}`,
    '',
    'ERRORI:',
    errors,
  ].join('\n');
};
