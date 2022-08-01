type Logger = {
    warn(...data: any[]): void;
    info(...data: any[]): void;
    debug(...data: any[]): void;
}

export class ClientConfig {

    constructor(private _connectionString: string,
                private _useConfirmChannel: boolean = false,
                private _reconnectionBackoff: number = 6000,
                private _connectionTimeout: number = 6000,
                private _qosPrefetch: number = 100,
                private _logger: Logger = console) {
    }

    get connectionString(): string {
        return this._connectionString;
    }

    get useConfirmChannel(): boolean {
        return this._useConfirmChannel;
    }

    get reconnectionBackoff(): number {
        return this._reconnectionBackoff;
    }

    get connectionTimeout(): number {
        return this._connectionTimeout;
    }

    get qosPrefetch(): number {
        return this._qosPrefetch;
    }

    get logger(): Logger {
        return this._logger;
    }
}
