<?php

// This is never read because of the redirect
// If you want to pass message, using session flash messages or something similar
header('X-Status: redirected somewhere');
header('Location: /static/partials/submit-form-php.html');
http_response_code(302);

// 302 Found, i.e. a temporary redirect
// 301 Moved Permanently