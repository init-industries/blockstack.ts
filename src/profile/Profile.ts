import { extractProfile, signProfileToken } from './jwt';
import { IProof, validateProofs } from './proof';
import { ProfileJson } from './schema/Profile.json';

export class Profile implements ProfileJson {
	public static fromJSON(profileJson: ProfileJson): Profile {
		return new Profile(profileJson['@id'], profileJson['@type']);
	}

	public static fromToken(token: string, publicKeyOrAddress?: string): Profile {
		const profile: ProfileJson = extractProfile(token, publicKeyOrAddress);
		return Profile.fromJSON(profile);
	}

	public readonly '@context': string = 'http://schema.org';
	public readonly '@type': string;
	public readonly '@id': string;

	constructor(id: string, type: string) {
		this['@id'] = id;
		this['@type'] = type;
	}

	public toJSON(): ProfileJson {
		return { ...(this as ProfileJson) };
	}

	public toToken(privateKey: string): string {
		return signProfileToken(this.toJSON(), privateKey);
	}

	public validateProofs(domainName: string): Promise<IProof[]> {
		return validateProofs(this.toJSON(), domainName);
	}
}
