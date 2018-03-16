/* @flow */
import { Service } from './service'
import cheerio from 'cheerio'

class HackerNews extends Service {
  static getBaseUrls() {
    const baseUrls = [
      'https://news.ycombinator.com/user?id=', 
      'http://news.ycombinator.com/user?id=',
      'news.ycombinator.com/user?id='
    ]
    return baseUrls
  }

  static getProofUrl(proof: Object) {
    const baseUrls = this.getBaseUrls()

    let proofUrl = proof.proof_url.toLowerCase()
    proofUrl = super.prefixScheme(proofUrl)

    for (let i = 0; i < baseUrls.length; i++) {
      if (proofUrl === `${baseUrls[i]}${proof.identifier}`) {
        return proofUrl
      }
    }
    throw new Error(`Proof url ${proof.proof_url} is not valid for service ${proof.service}`)
  }

  static getProofStatement(searchText: string) {
    const $ = cheerio.load(searchText)
    const tables = $('#hnmain').children().find('table')
    let statement = ''

    if (tables.length > 0) {
      tables.each((tableIndex, table) => {
        const rows = $(table).find('tr')

        if (rows.length > 0) {
          rows.each((idx, row) => {
            const heading = $(row).find('td')
                                  .first()
                                  .text()
                                  .trim()

            if (heading === 'about:') {
              statement = $(row).find('td')
                                .last()
                                .text()
                                .trim()
            }
          })
        }
      })
    } 

    return statement
  }
}

export { HackerNews }
