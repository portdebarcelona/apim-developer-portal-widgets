"use strict";
(function completeSwaggerOAuth() {
  var oauth2 = window.opener && window.opener.swaggerUIRedirectOauth2;
  if (!oauth2) {
    document.body.textContent = "OAuth session is no longer available. You can close this window.";
    return;
  }
  var source = /code|token|error/.test(window.location.hash)
    ? window.location.hash.substring(1).replace("?", "&")
    : window.location.search.substring(1);
  var payload = {};
  source.split("&").filter(Boolean).forEach(function (entry) {
    var parts = entry.split("=");
    payload[decodeURIComponent(parts.shift())] = decodeURIComponent(parts.join("=") || "");
  });
  var valid = payload.state === oauth2.state;
  if (payload.error) {
    oauth2.errCb({
      authId: oauth2.auth.name,
      source: "auth",
      level: "error",
      message: payload.error_description || payload.error
    });
    window.close();
    return;
  }
  var flow = oauth2.auth.schema.get("flow");
  var authorizationCode = flow === "accessCode" || flow === "authorizationCode" || flow === "authorization_code";
  if (authorizationCode && !oauth2.auth.code) {
    if (!valid) {
      oauth2.errCb({authId: oauth2.auth.name, source: "auth", level: "warning", message: "OAuth state mismatch"});
      window.close();
      return;
    }
    oauth2.auth.code = payload.code;
    delete oauth2.state;
    oauth2.callback({auth: oauth2.auth, redirectUrl: oauth2.redirectUrl});
  } else {
    oauth2.callback({auth: oauth2.auth, token: payload, isValid: valid, redirectUrl: oauth2.redirectUrl});
  }
  window.close();
})();
