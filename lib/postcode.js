// Split out from lib/constants.js so the ~230KB postcode dataset only
// loads on pages that actually need it (Customers), not every page's
// shared bundle via the widely-imported constants module.
import { findPostcode } from 'malaysia-postcodes'

export function lookupPostcode(postcode) {
  if (!postcode || postcode.length !== 5) return null
  const result = findPostcode(postcode)
  return result?.found ? { city: result.city, state: result.state } : null
}
