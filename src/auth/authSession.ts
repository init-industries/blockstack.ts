/* @flow */
import { TokenSigner, decodeToken, SECP256K1Client } from 'jsontokens'
import * as fetch from 'isomorphic-fetch'

/**
 * Create an authentication token to be sent to the Core API server
 * in order to generate a Core session JWT.
 *
 * @param {String} appDomain  The unique application identifier (e.g. foo.app, www.foo.com, etc).
 * @param {Array} appMethods  The list of API methods this application will need.
 * @param {String} appPrivateKey  The application-specific private key
 * @param {String|null} blockchainID  This is the blockchain ID of the requester
 * @param {String} thisDevice Identifier of the current device
 *
 * @return {String} a JWT signed by the app's private key
 * @deprecated
 * @private
 */
export function makeCoreSessionRequest(appDomain: string,
                                       appMethods: Array<string>,
                                       appPrivateKey: string,
                                       blockchainID: string|null = null,
                                       thisDevice: string|null = null) {
  if (thisDevice === null) {
    thisDevice = '.default'
  }

  // TODO: multi-device
  const appPublicKey = SECP256K1Client.derivePublicKey(appPrivateKey)
  const appPublicKeys = [{
    public_key: appPublicKey,
    device_id: thisDevice
  }]

  const authBody = {
    version: 1,
    blockchain_id: blockchainID,
    app_private_key: appPrivateKey,
    app_domain: appDomain,
    methods: appMethods,
    app_public_keys: appPublicKeys,
    device_id: thisDevice
  }

  // make token
  const tokenSigner = new TokenSigner('ES256k', appPrivateKey)
  const token = <string>tokenSigner.sign(authBody, false)

  return token
}


/**
 * Send Core a request for a session token.
 *
 * @param {String} coreHost host name of the core node
 * @param {Number} corePort port number of the core node
 * @param {String} coreAuthRequest  a signed JWT encoding the authentication request
 * @param {String} apiPassword the API password for Core
 *
 * @return {Promise} the resolves to a JWT signed with the Core API server's private key
 * that authorizes the bearer to carry out the requested operations and rejects
 * with an error message otherwise
 * @deprecated
 * @private
 */
export function sendCoreSessionRequest(coreHost: string,
                                       corePort: number,
                                       coreAuthRequest: string,
                                       apiPassword: string) {
  return new Promise((resolve, reject) => {
    if (!apiPassword) {
      reject('Missing API password')
      return null
    }

    const options = {
      headers: {
        Authorization: `bearer ${apiPassword}`
      }
    }

    const url = `http://${coreHost}:${corePort}/v1/auth?authRequest=${coreAuthRequest}`

    return fetch(url, options)
    .then(response => {
      if (!response.ok) {
        reject('HTTP status not OK')
        return null
      }
      return response.text()
    })
    .then(responseText => JSON.parse(responseText))
    .then(responseJson => {
      const token = responseJson.token
      if (!token) {
        reject('Failed to get Core session token')
        return null
      }
      resolve(token)
      return token
    })
    .catch(error => {
      console.error(error)
      reject('Invalid Core response: not JSON')
    })
  })
}


/**
 * Get a core session token.  Generate an auth request, sign it, send it to Core,
 * and get back a session token.
 *
 * @param {String} coreHost Core API server's hostname
 * @param {Number} corePort Core API server's port number
 * @param {String} apiPassword core api password
 * @param  {String} appPrivateKey Application's private key
 * @param  {String} blockchainId blockchain ID of the user signing in.
 * `null` if user has no blockchain ID
 * @param {String} authRequest authentication request token
 * @param {String} deviceId identifier for the current device
 *
 * @return {Promise} a Promise that resolves to a Core session token or rejects
 * with an error message.
 * @deprecated
 * @private
 */
export function getCoreSession(coreHost: string,
                               corePort: number,
                               apiPassword: string,
                               appPrivateKey: string,
                               blockchainId: string|null = null,
                               authRequest: string|null = null,
                               deviceId: string = '0') {
  if (!authRequest) {
    return Promise.reject('No authRequest provided')
  }

  let payload = null
  let authRequestObject = null
  try {
    authRequestObject = decodeToken(authRequest)
    if (!authRequestObject) {
      return Promise.reject('Invalid authRequest in URL query string')
    }
    if (!authRequestObject.payload) {
      return Promise.reject('Invalid authRequest in URL query string')
    }
    payload = authRequestObject.payload
  } catch (e) {
    console.error(e.stack)
    return Promise.reject('Failed to parse authRequest in URL')
  }

  const appDomain = payload.domain_name
  if (!appDomain) {
    return Promise.reject('No domain_name in authRequest')
  }
  const appMethods = payload.scopes

  const coreAuthRequest = makeCoreSessionRequest(
      appDomain, appMethods, appPrivateKey, blockchainId, deviceId)

  return sendCoreSessionRequest(
      coreHost, corePort, coreAuthRequest, apiPassword)
}
