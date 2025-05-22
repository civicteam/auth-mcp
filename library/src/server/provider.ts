import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { CIVIC_AUTH_WELL_KNOWN_URL } from "../constants.js";
import {
	AuthOptions,
	CivicOAuthProviderOptions, ExtendedJWTPayload,
	OIDCWellKnownConfiguration,
} from "./types.js";

/**
 * Creates AuthOptions configured for Civic OAuth that can be used with mcp-common's registerServer
 *
 * @param options - Configuration options for the provider
 * @returns AuthOptions that can be passed to registerServer
 */
export async function createCivicOAuthProvider(
	options: CivicOAuthProviderOptions,
): Promise<AuthOptions> {
	const wellKnownUrl = options.wellKnownUrl || CIVIC_AUTH_WELL_KNOWN_URL;

	// Fetch the well-known configuration
	const response = await fetch(wellKnownUrl);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch well-known configuration: ${response.statusText}`,
		);
	}

	const config = (await response.json()) as OIDCWellKnownConfiguration;

	// Use provided issuerUrl or extract from config
	const issuerUrl = options.issuerUrl || new URL(config.issuer);

	// Create JWKS client for token verification
	const jwks = createRemoteJWKSet(new URL(config.jwks_uri));

	return {
		proxy: {
			endpoints: {
				authorizationUrl: config.authorization_endpoint,
				tokenUrl: config.token_endpoint,
				revocationUrl: config.revocation_endpoint,
				registrationUrl: config.registration_endpoint,
			},
			verifyAccessToken: async (token) => {
				// Verify the JWT token using the JWKS
				const { payload } = await jwtVerify(token, jwks, {
					issuer: config.issuer,
				});

				const { email, name, picture } = payload as ExtendedJWTPayload

				// Extract relevant fields from the payload
				return {
					token,
					clientId: (payload.client_id as string) || (payload.aud as string), // aud is used in the id token,
					scopes: payload.scope ? (payload.scope as string).split(" ") : [],
					// include id token claims if the id token is passed
					extra: {
						sub: payload.sub as string,
						...(email ? {email, name, picture} : {})
					},
				};
			},
			getClient: async (client_id) => {
				// Build client configuration based on well-known config
				const client: OAuthClientInformationFull = {
					client_id,
					redirect_uris: options.redirectUris,
				};

				// Set values based on the well-known configuration
				if (config.response_types_supported) {
					client.response_types = config.response_types_supported;
				}

				if (config.grant_types_supported) {
					client.grant_types = config.grant_types_supported;
				}

				if (config.scopes_supported) {
					// Use the scopes supported by the server, filtered to common ones
					client.scope = config.scopes_supported
						.filter((scope: string) =>
							["openid", "profile", "email"].includes(scope),
						)
						.join(" ");
				}

				if (config.token_endpoint_auth_methods_supported) {
					// Use the first supported method that doesn't require client credentials
					const publicMethods = ["none", "private_key_jwt"];
					client.token_endpoint_auth_method =
						config.token_endpoint_auth_methods_supported.find(
							(method: string) => publicMethods.includes(method),
						) || "none";
				}

				return client;
			},
		},
		router: {
			issuerUrl,
			serviceDocumentationUrl:
				options.serviceDocumentationUrl || new URL("https://docs.civic.com/"),
		},
	};
}
