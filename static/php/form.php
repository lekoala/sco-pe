<?php

header('X-Status: posted');

echo '<pre>';
print_r($_POST);

// You should probably render a success message or re render the form with the proper data inserted
// or redirect somewhere else