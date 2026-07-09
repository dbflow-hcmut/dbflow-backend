/**
 * Minimal mirror of dbflow-frontend's `PhysicalModelPayload`
 * (src/components/EditProject/utils/physical-model.builder.ts). No shared
 * package exists between the two repos, so only the fields the sandbox
 * DDL builder / sync algorithm actually need are declared here.
 */

export interface SandboxForeignKey {
  refTableId: string;
  refColumnId: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface SandboxColumnRoles {
  primaryKey?: boolean;
  foreignKey?: SandboxForeignKey;
  candidateKey?: boolean;
}

export interface SandboxColumn {
  id: string;
  name: string;
  dataType?: string;
  length?: string;
  nullable: boolean;
  unique: boolean;
  autoIncrement?: boolean;
  defaultValue?: string;
  roles?: SandboxColumnRoles;
}

export interface SandboxIndexColumn {
  columnName: string;
  order?: 'ASC' | 'DESC';
}

export interface SandboxIndex {
  id: string;
  name: string;
  type?: string;
  columns: SandboxIndexColumn[];
  isUnique: boolean;
}

export interface SandboxTable {
  id: string;
  name: string;
  columns: SandboxColumn[];
  indexes?: SandboxIndex[];
}

export interface PhysicalModelPayload {
  model: { id: string; name: string; version?: number; dbms?: string };
  tables: SandboxTable[];
}

export type SyncAction =
  | 'unchanged'
  | 'created'
  | 'dropped'
  | 'migrated'
  | 'reset';

export interface SyncReportEntry {
  table: string;
  action: SyncAction;
  reason?: string;
}
