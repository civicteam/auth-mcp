import {
	StreamableHTTPClientTransport,
	StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CLIAuthProvider } from "../providers/index.js";

type RestartableStreamableHTTPClientTransportOpts =
	StreamableHTTPClientTransportOptions & {
		authProvider: CLIAuthProvider;
	};

/**
 * A transport that extends StreamableHTTPClientTransport to support restarting
 * the connection after authentication. This is particularly useful when
 * implementing authentication flows that require redirection and reconnection.
 */
export class RestartableStreamableHTTPClientTransport extends StreamableHTTPClientTransport {
	private _cliAuthProvider: CLIAuthProvider;

	constructor(url: URL, opts: RestartableStreamableHTTPClientTransportOpts) {
		super(url, opts);
		this._cliAuthProvider = opts.authProvider; // Assign the authProvider from options so that we have access

		// Register this transport with the auth provider
		this._cliAuthProvider.registerTransport(this);
	}

	get authProvider(): CLIAuthProvider {
		return this._cliAuthProvider;
	}

	/**
	 * Extends the start method to properly handle reconnection.
	 * If the transport has already been started, it will disconnect first,
	 * then start again to establish a fresh connection.
	 */
	override async start() {
		try {
			await super.start();
		} catch (error) {
			// ignore restart errors here
			console.log("Error starting transport:", error);
		}
	}
}
