export type AwarenessUser = {
  userId: string;
  sessionId: string;
  name: string;
  color: string;
  isVerified: boolean;
};

export type CursorData = { sessionId: string; cursorInfo: CursorInfo };

export type CursorInfo = {
  line: number;
  column: number;
  position: number;
  filename: string;
};

export type AwarenessState = {
  clientId: number;
  projectId: string;
  sessionId: string;
  user: AwarenessUser;
  cursor?: {
    anchor: Record<string, unknown>;
    head: Record<string, unknown>;
  };
  cursorInfo?: CursorInfo;
};
