const I18N_STUB_URL =
  'data:text/javascript,' +
  encodeURIComponent('export const translate = message => message;\n')

const CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === '../../../lib/i18n' || specifier === '../../../lib/i18n.tsx') {
    return { url: I18N_STUB_URL, shortCircuit: true }
  }

  try {
    return await defaultResolve(specifier, context, defaultResolve)
  } catch (error) {
    if (
      error?.code === 'ERR_MODULE_NOT_FOUND' &&
      (specifier.startsWith('./') || specifier.startsWith('../'))
    ) {
      for (const extension of CANDIDATE_EXTENSIONS) {
        try {
          return await defaultResolve(`${specifier}${extension}`, context, defaultResolve)
        } catch {}
      }
    }

    throw error
  }
}
