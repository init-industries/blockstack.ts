import { protocolCheck } from 'custom-protocol-detection-blockstack';
import { decodeToken } from 'jsontokens';
import * as queryString from 'query-string';

import {
	BLOCKSTACK_APP_PRIVATE_KEY_LABEL,
	BLOCKSTACK_DEFAULT_GAIA_HUB_URL,
	BLOCKSTACK_GAIA_HUB_LABEL,
	BLOCKSTACK_HANDLER,
	BLOCKSTACK_STORAGE_LABEL,
	DEFAULT_BLOCKSTACK_HOST,
	DEFAULT_SCOPE
} from '../constants';
import { DebugType, Logger } from '../debug';
import { makeECPrivateKey } from '../index';
import { extractProfile } from '../profile';
import { isLaterVersion } from '../utils';
import { makeAuthRequest, verifyAuthResponse } from './index';
import { decryptPrivateKey } from './messages';

const DEFAULT_PROFILE = {
	'@context': 'http://schema.org',
	'@type': 'Person'
};

/**
 * Generates a ECDSA keypair and stores the hex value of the private key in
 * local storage.
 * @return {String} the hex encoded private key
 * @private
 */
export function generateAndStoreTransitKey() {
	const transitKey = makeECPrivateKey();
	localStorage.setItem(BLOCKSTACK_APP_PRIVATE_KEY_LABEL, transitKey);
	return transitKey;
}

/**
 * Fetches the hex value of the transit private key from local storage.
 * @return {String} the hex encoded private key
 * @private
 */
export function getTransitKey() {
	return localStorage.getItem(BLOCKSTACK_APP_PRIVATE_KEY_LABEL);
}

/**
 * Check if a user is currently signed in.
 * @return {Boolean} `true` if the user is signed in, `false` if not.
 */
export function isUserSignedIn() {
	return !!window.localStorage.getItem(BLOCKSTACK_STORAGE_LABEL);
}

/**
 * Redirects the user to the Blockstack browser to approve the sign in request
 * given.
 *
 * The user is redirected to the `blockstackIDHost` if the `blockstack:`
 * protocol handler is not detected. Please note that the protocol handler detection
 * does not work on all browsers.
 * @param  {String} authRequest - the authentication request generated by `makeAuthRequest`
 * @param  {String} blockstackIDHost - the URL to redirect the user to if the blockstack
 *                                     protocol handler is not detected
 * @return {void}
 */
export function redirectToSignInWithAuthRequest(
	authRequest: string = makeAuthRequest(),
	blockstackIDHost: string = DEFAULT_BLOCKSTACK_HOST
) {
	const protocolURI = `${BLOCKSTACK_HANDLER}:${authRequest}`;
	const httpsURI = `${blockstackIDHost}?authRequest=${authRequest}`;
	function successCallback() {
		Logger.log(DebugType.info, 'Protocol handler detected');

		// protocolCheck should open the link for us
	}

	function failCallback() {
		Logger.log(DebugType.info, 'Protocol handler not detected');
		window.location.href = httpsURI;
	}

	function unsupportedBrowserCallback() {
		// Safari is unsupported by protocolCheck

		Logger.log(DebugType.warn, 'Cannot detect custom protocols on this browser');
		window.location.href = protocolURI;
	}

	protocolCheck(protocolURI, failCallback, successCallback, unsupportedBrowserCallback);
}

/**
 * Generates an authentication request and redirects the user to the Blockstack
 * browser to approve the sign in request.
 *
 * Please note that this requires that the web browser properly handles the
 * `blockstack:` URL protocol handler.
 *
 * Most applications should use this
 * method for sign in unless they require more fine grained control over how the
 * authentication request is generated. If your app falls into this category,
 * use `generateAndStoreTransitKey`, `makeAuthRequest`,
 * and `redirectToSignInWithAuthRequest` to build your own sign in process.
 *
 * @param {String} [redirectURI=`${window.location.origin}/`]
 * The location to which the identity provider will redirect the user after
 * the user approves sign in.
 * @param  {String} [manifestURI=`${window.location.origin}/manifest.json`]
 * Location of the manifest file.
 * @param  {Array} [scopes=DEFAULT_SCOPE] Defaults to requesting write access to
 * this app's data store.
 * An array of strings indicating which permissions this app is requesting.
 * @return {void}
 */
export function redirectToSignIn(
	redirectURI: string = `${window.location.origin}/`,
	manifestURI: string = `${window.location.origin}/manifest.json`,
	scopes: string[] = DEFAULT_SCOPE
) {
	const authRequest = makeAuthRequest(generateAndStoreTransitKey(), redirectURI, manifestURI, scopes);
	redirectToSignInWithAuthRequest(authRequest);
}

/**
 * Retrieve the authentication token from the URL query
 * @return {String} the authentication token if it exists otherwise `null`
 */
export function getAuthResponseToken() {
	const queryDict = queryString.parse(location.search);
	return queryDict.authResponse ? queryDict.authResponse : null;
}

/**
 * Check if there is a authentication request that hasn't been handled.
 * @return {Boolean} `true` if there is a pending sign in, otherwise `false`
 */
export function isSignInPending() {
	return !!getAuthResponseToken();
}

/**
 * Try to process any pending sign in request by returning a `Promise` that resolves
 * to the user data object if the sign in succeeds.
 *
 * @param {String} nameLookupURL - the endpoint against which to verify public
 * keys match claimed username
 *
 * @return {Promise} that resolves to the user data object if successful and rejects
 * if handling the sign in request fails or there was no pending sign in request.
 */
export function handlePendingSignIn(nameLookupURL: string = 'https://core.blockstack.org/v1/names/') {
	const authResponseToken = getAuthResponseToken();

	return new Promise((resolve, reject) => {
		verifyAuthResponse(authResponseToken, nameLookupURL).then(isValid => {
			if (isValid) {
				const tokenPayload = decodeToken(authResponseToken).payload;
				// TODO: real version handling
				let appPrivateKey = tokenPayload.private_key;
				let coreSessionToken = tokenPayload.core_token;
				if (isLaterVersion(tokenPayload.version, '1.1.0')) {
					const transitKey = getTransitKey();
					if (transitKey !== undefined && transitKey != null) {
						if (appPrivateKey !== undefined && appPrivateKey !== null) {
							try {
								appPrivateKey = decryptPrivateKey(transitKey, appPrivateKey);
							} catch (e) {
								Logger.log(DebugType.warn, 'Failed decryption of appPrivateKey, will try to use as given');
							}
						}
						if (coreSessionToken !== undefined && coreSessionToken !== null) {
							try {
								coreSessionToken = decryptPrivateKey(transitKey, coreSessionToken);
							} catch (e) {
								Logger.log(DebugType.warn, 'Failed decryption of coreSessionToken, will try to use as given');
							}
						}
					}
				}
				let hubUrl = BLOCKSTACK_DEFAULT_GAIA_HUB_URL;
				if (
					isLaterVersion(tokenPayload.version, '1.2.0') &&
					tokenPayload.hubUrl !== null &&
					tokenPayload.hubUrl !== undefined
				) {
					hubUrl = tokenPayload.hubUrl;
				}

				const userData = {
					appPrivateKey,
					authResponseToken,
					coreSessionToken,
					hubUrl,
					profile: tokenPayload.profile,
					username: tokenPayload.username
				};
				const profileURL = tokenPayload.profile_url;
				if (
					(userData.profile === null || userData.profile === undefined) &&
					profileURL !== undefined &&
					profileURL !== null
				) {
					fetch(profileURL).then(response => {
						if (!response.ok) {
							// return blank profile if we fail to fetch
							userData.profile = DEFAULT_PROFILE;
							window.localStorage.setItem(BLOCKSTACK_STORAGE_LABEL, JSON.stringify(userData));
							resolve(userData);
						} else {
							response
								.text()
								.then(responseText => JSON.parse(responseText))
								.then(wrappedProfile => extractProfile(wrappedProfile[0].token))
								.then(profile => {
									userData.profile = profile;
									window.localStorage.setItem(BLOCKSTACK_STORAGE_LABEL, JSON.stringify(userData));
									resolve(userData);
								});
						}
					});
				} else {
					userData.profile = tokenPayload.profile;
					window.localStorage.setItem(BLOCKSTACK_STORAGE_LABEL, JSON.stringify(userData));
					resolve(userData);
				}
			} else {
				reject();
			}
		});
	});
}

/**
 * Retrieves the user data object. The user's profile is stored in the key `profile`.
 * @return {Object} User data object.
 */
export function loadUserData() {
	const item = window.localStorage.getItem(BLOCKSTACK_STORAGE_LABEL);
	if (item === null) {
		return null;
	} else {
		return JSON.parse(item);
	}
}

/**
 * Sign the user out and optionally redirect to given location.
 * @param  {String} [redirectURL=null] Location to redirect user to after sign out.
 * @return {void}
 */
export function signUserOut(redirectURL?: string) {
	window.localStorage.removeItem(BLOCKSTACK_STORAGE_LABEL);
	window.localStorage.removeItem(BLOCKSTACK_GAIA_HUB_LABEL);

	if (redirectURL !== undefined) {
		window.location.href = redirectURL;
	}
}
