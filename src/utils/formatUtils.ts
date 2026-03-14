export const formatContent = (content: string) => {
  if (!content) return '';
  // The model might return literal escape characters if JSON escaping fails.
  // We restore them to their LaTeX-safe backslashed versions.
  return content
    .replace(/\t/g, '\\t') // \text, \times, \tau
    .replace(/\r/g, '\\r') // \right, \rho
    .replace(/\n/g, '\\n') // \nu (if it was a literal newline, we'll fix it below)
    .replace(/\x08/g, '\\b') // \beta
    .replace(/\x0c/g, '\\f') // \frac
    .replace(/\x0b/g, '\\v') // \vec
    // Handle naked LaTeX commands like \alpha by wrapping them in $
    .replace(/(?<!\$)\\(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)(?!\$)/g, '$\\\\$1$')
    // Now handle the actual intended newlines
    .replace(/\\n/g, '\n')
    .replace(/\\\\n/g, '\n');
};
