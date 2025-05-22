import type {
	OAuthClientInformation,
	OAuthClientInformationFull,
	OAuthClientMetadata,
	OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
	CivicAuthProvider,
	CivicAuthProviderOptions,
} from "./CivicAuthProvider.js";

/**
 * Configuration options for TokenAuthProvider
 */
export interface TokenAuthProviderOptions extends CivicAuthProviderOptions {
	/**
	 * OAuth tokens to use for authentication
	 */
	tokens: OAuthTokens;

	/**
	 * Client metadata for OAuth flows
	 */
	clientMetadata?: OAuthClientMetadata;

	/**
	 * Redirect URL for OAuth flows (not used for token-based auth)
	 */
	redirectUrl?: string | URL;
}

/**
 * Authentication provider for pre-obtained tokens.
 * Use this when you already have access tokens from an external OAuth flow
 * and want to use them directly with the MCP client.
 */
export class TokenAuthProvider extends CivicAuthProvider {
	private storedClientMetadata: OAuthClientMetadata;
	private storedRedirectUrl: string | URL;

	constructor(options: TokenAuthProviderOptions) {
		super(options);
		this.storedTokens = options.tokens;
		this.storedClientMetadata = options.clientMetadata || {
			redirect_uris: ["http://localhost:8080/callback"],
			scope: "openid profile email",
		};
		this.storedRedirectUrl =
			options.redirectUrl || "http://localhost:8080/callback";
	}

	get redirectUrl(): string | URL {
		return this.storedRedirectUrl;
	}

	get clientMetadata(): OAuthClientMetadata {
		return this.storedClientMetadata;
	}

	clientInformation(): OAuthClientInformation | undefined {
		return {
			client_id: "token-client",
		};
	}

	saveTokens(tokens: OAuthTokens): void {
		this.storedTokens = tokens;
	}

	redirectToAuthorization(authorizationUrl: URL): void {
		// No-op - tokens are already available
	}

	saveCodeVerifier(codeVerifier: string): void {
		// No-op for token-based auth
	}

	codeVerifier(): string {
		// Return empty string as no code verifier is needed for token-based auth
		return "";
	}
}
