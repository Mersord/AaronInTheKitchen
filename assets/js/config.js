/* Site-wide options. This file contains no secret credentials. */
window.AARON_CONFIG = {
  // Optional public Google Fonts stylesheet, close to the source typography.
  // Set false for a fully local site; Georgia/Arial are used as fallbacks.
  // Font files are not included in this website package.
  useGoogleFonts: true,

  // Add a public HTTPS form endpoint to enable real submissions.
  // Empty = explicit preview mode; nothing is sent or stored.
  // Compatible with a CORS-enabled endpoint accepting JSON and returning 2xx
  // only after accepting the message, e.g. an appropriately configured form service.
  // Never put SMTP credentials or a private API key in client-side JavaScript.
  contactEndpoint: ""
};
