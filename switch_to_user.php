<?php
// Backward-compatible route: this action is a logout.
header('Location: logout.php?next=' . rawurlencode('index.html'));
exit;
