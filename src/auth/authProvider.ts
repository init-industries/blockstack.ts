import { decodeToken, JWT } from 'jsontokens';
import * as queryString from 'query-string';

import { log, DebugType } from '../debug';
import { updateQueryStringParameter } from '../index';
import { BLOCKSTACK_HANDLER } from '../utils';

/**
 * Retrieves the authentication request from the query string
 * @return {String|null} the authentication request or `null` if
 * the query string parameter `authRequest` is not found
 * @private
 */
export function getAuthRequestFromURL() {
	const queryDict = queryString.parse(location.search);
	if (queryDict.authRequest !== null && queryDict.authRequest !== undefined) {
		return queryDict.authRequest.split(`${BLOCKSTACK_HANDLER}:`).join('');
	} else {
		return null;
	}
}

/**
 * Fetches the contents of the manifest file specified in the authentication request
 *
 * @param  {String} authRequest encoded and signed authentication request
 * @return {Promise<Object|String>} Returns a `Promise` that resolves to the JSON
 * object manifest file unless there's an error in which case rejects with an error
 * message.
 * @private
 */
export function fetchAppManifest(authRequest: string | JWT): Promise<object | string> {
	return new Promise((resolve, reject) => {
		if (!authRequest) {
			reject('Invalid auth request');
		} else {
			const payload = decodeToken(authRequest).payload;
			const manifestURI = payload.manifest_uri;
			try {
				fetch(manifestURI)
					.then(response => response.text())
					.then(responseText => JSON.parse(responseText))
					.then(responseJSON => {
						resolve(responseJSON);
					})
					.catch(e => {
						log(DebugType.error, 'Error while requesting manifest', e.stack);
						reject("URI request couldn't be completed");
					});
			} catch (e) {
				log(DebugType.error, 'Error while requesting manifest', e.stack);
				reject("URI request couldn't be completed");
			}
		}
	});
}

/**
 * Redirect the user's browser to the app using the `redirect_uri`
 * specified in the authentication request, passing the authentication
 * response token as a query parameter.
 *
 * @param {String} authRequest  encoded and signed authentication request token
 * @param  {String} authResponse encoded and signed authentication response token
 * @return {void}
 * @throws {Error} if there is no redirect uri
 * @private
 */
export function redirectUserToApp(authRequest: string | JWT, authResponse: string) {
	const payload = decodeToken(authRequest).payload;
	let redirectURI = payload.redirect_uri;
	log(DebugType.info, 'redirectURI: ', redirectURI);
	if (redirectURI) {
		redirectURI = updateQueryStringParameter(redirectURI, 'authResponse', authResponse);
	} else {
		throw new Error('Invalid redirect URI');
	}
	window.location.href = redirectURI;
}
