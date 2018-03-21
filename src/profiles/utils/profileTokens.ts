import * as ecurve from 'ecurve';
import { ECPair } from 'bitcoinjs-lib';
import { decodeToken, SECP256K1Client, TokenSigner, TokenVerifier, JWT } from 'jsontokens';

import { nextYear, makeUUID4 } from '../../utils';
import { Profile as ProfileJson } from '../schemas/Profile.json';

const secp256k1 = ecurve.getCurveByName('secp256k1');

/**
 * Signs a profile token
 * @param {Object} profile - the JSON of the profile to be signed
 * @param {String} privateKey - the signing private key
 * @param {Object} subject - the entity that the information is about
 * @param {Object} issuer - the entity that is issuing the token
 * @param {String} signingAlgorithm - the signing algorithm to use
 * @param {Date} issuedAt - the time of issuance of the token
 * @param {Date} expiresAt - the time of expiration of the token
 * @returns {Object} - the signed profile token
 */
export function signProfileToken(
	profile: object,
	privateKey: string,
	subject: { publicKey: string } | null = null,
	issuer: { publicKey: string } | null = null,
	signingAlgorithm = 'ES256K',
	issuedAt = new Date(),
	expiresAt = nextYear()
) {
	if (signingAlgorithm !== 'ES256K') {
		throw new Error('Signing algorithm not supported');
	}

	const publicKey: string = SECP256K1Client.derivePublicKey(privateKey);

	if (subject === null) {
		subject = { publicKey };
	}

	if (issuer === null) {
		issuer = { publicKey };
	}

	const tokenSigner = new TokenSigner(signingAlgorithm, privateKey);

	const payload = {
		jti: makeUUID4(),
		iat: issuedAt.toISOString(),
		exp: expiresAt.toISOString(),
		subject,
		issuer,
		claim: profile
	};

	return tokenSigner.sign(payload, false) as string;
}

/**
 * Wraps a token for a profile token file
 * @param {String} token - the token to be wrapped
 * @returns {Object} - including `token` and `decodedToken`
 */
export function wrapProfileToken(token: string) {
	return {
		token,
		decodedToken: decodeToken(token)
	};
}

/**
 * Verifies a profile token
 * @param {String} token - the token to be verified
 * @param {String} publicKeyOrAddress - the public key or address of the
 *   keypair that is thought to have signed the token
 * @returns {Object} - the verified, decoded profile token
 * @throws {Error} - throws an error if token verification fails
 */
export function verifyProfileToken(token: string, publicKeyOrAddress: string) {
	const decodedToken = decodeToken(token);
	const payload = decodedToken.payload;

	// Inspect and verify the subject
	if (payload.hasOwnProperty('subject')) {
		if (!payload.subject.hasOwnProperty('publicKey')) {
			throw new Error("Token doesn't have a subject public key");
		}
	} else {
		throw new Error("Token doesn't have a subject");
	}

	// Inspect and verify the issuer
	if (payload.hasOwnProperty('issuer')) {
		if (!payload.issuer.hasOwnProperty('publicKey')) {
			throw new Error("Token doesn't have an issuer public key");
		}
	} else {
		throw new Error("Token doesn't have an issuer");
	}

	// Inspect and verify the claim
	if (!payload.hasOwnProperty('claim')) {
		throw new Error("Token doesn't have a claim");
	}

	const issuerPublicKey = payload.issuer.publicKey;
	const publicKeyBuffer = new Buffer(issuerPublicKey, 'hex');

	const Q = ecurve.Point.decodeFrom(secp256k1, publicKeyBuffer);
	const compressedKeyPair = new ECPair(null, Q, { compressed: true });
	const compressedAddress = compressedKeyPair.getAddress();
	const uncompressedKeyPair = new ECPair(null, Q, { compressed: false });
	const uncompressedAddress = uncompressedKeyPair.getAddress();

	if (publicKeyOrAddress === issuerPublicKey) {
		// pass
	} else if (publicKeyOrAddress === compressedAddress) {
		// pass
	} else if (publicKeyOrAddress === uncompressedAddress) {
		// pass
	} else {
		throw new Error('Token issuer public key does not match the verifying value');
	}

	const tokenVerifier = new TokenVerifier(decodedToken.header.alg, issuerPublicKey);
	if (!tokenVerifier) {
		throw new Error('Invalid token verifier');
	}

	const tokenVerified = tokenVerifier.verify(token);
	if (!tokenVerified) {
		throw new Error('Token verification failed');
	}

	return decodedToken;
}

/**
 * Extracts a profile from an encoded token and optionally verifies it,
 * if `publicKeyOrAddress` is provided.
 * @param {String} token - the token to be extracted
 * @param {String} publicKeyOrAddress - the public key or address of the
 *   keypair that is thought to have signed the token
 * @returns {Object} - the profile extracted from the encoded token
 * @throws {Error} - if the token isn't signed by the provided `publicKeyOrAddress`
 */
export function extractProfile(token: string, publicKeyOrAddress?: string) {
	let decodedToken;
	if (publicKeyOrAddress !== undefined) {
		decodedToken = verifyProfileToken(token, publicKeyOrAddress);
	} else {
		decodedToken = decodeToken(token);
	}

	let profile: ProfileJson = {};
	if (decodedToken.hasOwnProperty('payload')) {
		const payload = decodedToken.payload;
		if (payload.hasOwnProperty('claim')) {
			profile = decodedToken.payload.claim;
		}
	}

	return profile;
}
