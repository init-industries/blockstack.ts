/* @flow */
import { profileServices } from '../services';
import { Profile as ProfileJson } from '../schemas/Profile.json';
import { IAccount } from '../Person';

/**
 * Validates the social proofs in a user's profile. Currently supports validation of
 * Facebook, Twitter, GitHub, Instagram, LinkedIn and HackerNews accounts.
 *
 * @param {Object} profile The JSON of the profile to be validated
 * @param {string} ownerAddress The owner bitcoin address to be validated
 * @param {string} [name=null] The Blockstack name to be validated
 * @returns {Promise} that resolves to an array of validated proof objects
 */
export function validateProofs(profile: ProfileJson, ownerAddress: string, name?: string): Promise<IAccount> {
	if (!profile) {
		throw new Error('Profile must not be null');
	}

	let accounts: IAccount[] = [];
	let proofsToValidate: IAccount[] = [];

	if (profile.account !== undefined) {
		accounts = profile.account;
	} else {
		return new Promise(resolve => {
			resolve([]);
		});
	}

	accounts.forEach(account => {
		// skip if proof service is not supported
		if (account.service !== undefined && profileServices[account.service] !== undefined)) {
			return;
		}

		if (!(account.hasOwnProperty('proofType') && account.proofType === 'http' && account.hasOwnProperty('proofUrl'))) {
			return;
		}

		const proof = {
			service: account.service,
			proof_url: account.proofUrl,
			identifier: account.identifier,
			valid: false
		};

		proofsToValidate.push(
			new Promise(resolve => {
				resolve(profileServices[account.service].validateProof(proof, ownerAddress, name));
			})
		);
	});

	return Promise.all(proofsToValidate);
}
