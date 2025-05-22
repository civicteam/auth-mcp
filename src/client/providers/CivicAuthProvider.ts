import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
	OAuthClientInformation,
	OAuthClientInformationFull,
	OAuthClientMetadata,
	OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export interface CivicAuthProviderOptions {
	/**
	 * Whether to use the ID token instead of the access token for authorization.
	 * When true, the ID token will be returned in place of the access token.
	 * Defaults to false.
	 */
	useIDToken?: boolean;
}

/**
 * Abstract base class for Civic auth providers
 * Provides common functionality including optional ID token usage
 */
export abstract class CivicAuthProvider implements OAuthClientProvider {
	protected useIDToken: boolean;
	protected storedTokens: (OAuthTokens & { id_token?: string }) | undefined;

	constructor(options: CivicAuthProviderOptions) {
		this.useIDToken = options.useIDToken ?? false;
	}

	abstract clientInformation():
		| OAuthClientInformation
		| Promise<OAuthClientInformation | undefined>
		| undefined;

	abstract get clientMetadata(): OAuthClientMetadata;

	abstract codeVerifier(): string | Promise<string>;

	abstract get redirectUrl(): string | URL;

	abstract saveCodeVerifier(codeVerifier: string): void;

	abstract saveTokens(tokens: OAuthTokens): void;

	/**
	 * Returns the stored tokens, optionally swapping ID token for access token
	 * if useidtoken option is enabled
	 */
	tokens(): OAuthTokens | undefined {
		if (!this.storedTokens) {
			return undefined;
		}

		// If useidtoken is true and we have an ID token, swap it for the access token
		if (this.useIDToken && this.storedTokens.id_token) {
			return {
				...this.storedTokens,
				access_token: this.storedTokens.id_token,
			};
		}

		return this.storedTokens;
	}

	abstract redirectToAuthorization(authorizationUrl: URL): void | Promise<void>;
}
