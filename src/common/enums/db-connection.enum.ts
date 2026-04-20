export enum DbConnectionDbms {
  PostgreSQL = 'postgresql',
  MySQL = 'mysql',
  SQLServer = 'sqlserver',
}

export enum DbConnectionMethod {
  Direct = 'direct',
  SSH = 'ssh',
  LocalAgent = 'local_agent',
}

export enum DbConnectionStatus {
  Connected = 'connected',
  Failed = 'failed',
  Untested = 'untested',
}

export enum SshAuthType {
  Password = 'password',
  PrivateKey = 'private_key',
}
