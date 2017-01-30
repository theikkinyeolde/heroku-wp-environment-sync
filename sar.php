<?php
set_time_limit(0);

$option_schema = [
    [
        'name' => 'help',
        'opts' => [
            '--help'
        ],
        'need_value' => false,
        'optional' => true
    ],
    [
        'name' => 'user',
        'opts' => [
            '-u',
            '--user'
        ]
    ],
    [
        'name' => 'password',
        'opts' => [
            '-p',
            '--pass'
        ],
        'optional' => true
    ],
    [
        'name' => 'host',
        'opts' => [
            '-h',
            '--host'
        ]
    ],
    [
        'name' => 'database',
        'opts' => [
            '--db'
        ]
    ],
    [
        'name' => 'port',
        'opts' => [
            '--port'
        ],
        'optional' => true
    ],
    [
        'name' => 'replace',
        'opts' => [
            '--replace'
        ]
    ],
    [
        'name' => 'replace-with',
        'opts' => [
            '--replace-with'
        ]
    ],
    [
        'name' => 'replace-json',
        'opts' => [
            '--replace-json'
        ]
    ]
];

$search_column_types = [
    'tinyblob',
    'tinytext',
    'varbinary',
    'binary',
    'varchar',
    'char',
    'text',
    'blob',
    'mediumtext',
    'mediumblob',
    'longtext',
    'longblob'
];

function validateSchemaName ($name) {
    global $option_schema;

    foreach($option_schema as $schema) {
        if(empty($schema['opts']))
            continue;

        foreach($schema['opts'] as $n) {
            if($n == $name) {
                return $schema;
            }
        }
    }
    return false;
}

function getArgumentData ($arguments) {
    $output_data = [];

    if($arguments[0] == basename(__FILE__))
        array_shift($arguments);

    $last_was_name = false;
    $last_name = '';
    foreach($arguments as $arg) {
        if (!$last_was_name) {
            $schema = validateSchemaName($arg);

            if($schema && (!isset($schema['need_value']) || $schema['need_value'])) {
                $last_name = $schema['name'];
                $last_was_name = true;
            } else {
                $output_data['unnamed'][] = $arg;
            }
        } else {
            $output_data['named'][$last_name] = $arg;
            $last_was_name = false;
        }
    }

    return $output_data;
}

function recursiveObjectReplace ($object, $replace, $replace_with = "") {
    foreach($object as $key => $value) {
        if(is_string($value)) {
            $object[$key] = str_replace($replace, $replace_with, $value);
        } else if(is_array($value)) {
            $object[$key] = recursiveObjectReplace($value, $replace, $replace_with);
        } else {
            $object[$key] = $value;
        }
    }
    return $object;
}

$arguments = getArgumentData($argv);

$username = $arguments['named']['user'];
$password = (isset($arguments['named']['password'])) ? $arguments['named']['password'] : '';
$port     = (isset($arguments['named']['port'])) ? $arguments['named']['port'] : 3306 ;
$database = $arguments['named']['database'];
$host = (isset($arguments['named']['host'])) ? $arguments['named']['host'] : 'localhost';

if(empty($username) || empty($database)) {
    die("No username or database specified.");
}

$mysql = new mysqli($host, $username, $password, $database, $port);

if($mysql->connect_error) {
    die("Error connecting to mysql. (" . $mysql->connect_error . ")");
}


$replace = (string) $arguments['named']['replace'];
$replace_with = (string) $arguments['named']['replace-with'];

$column_type_like = '';
if(preg_match("/[a-zA-Z]/", $replace.$replace_with)) {
    foreach($search_column_types as $type) {
        if(!empty($column_type_like))
            $column_type_like .= " OR ";
        else
            $column_type_like .= '(';

        $column_type_like .= "UPPER(COLUMN_TYPE) LIKE '%" . strtoupper($type) . "%'";
    }

    $column_type_like .= ')';

    $column_type_like = ' AND ' . $column_type_like;
}

$tables = $mysql->query("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '" . $mysql->real_escape_string($database) . "'");

if($tables && !empty($replace) && !empty($replace_with)) {
    foreach($tables->fetch_all(MYSQLI_ASSOC) as $table) {
        $table_name = $table['TABLE_NAME'];
        
        $primary_key = $mysql->query("SHOW INDEX FROM " . $table_name . " WHERE Key_name = 'PRIMARY'")->fetch_array()['Column_name'];
        
        echo "\n" . $table_name;

        if($primary_key) {
            $columns = $mysql->query("SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '" . $mysql->real_escape_string($database) . "' AND TABLE_NAME = '" . $table_name . "'" . $column_type_like);

            if(!$columns)
                continue;

            foreach($columns->fetch_all(MYSQLI_ASSOC) as $column) {

                $column_name = $column['COLUMN_NAME'];
                $column_type = $column['COLUMN_TYPE'];

                $rows = $mysql->query("SELECT " . $primary_key . ", " . $column_name . " FROM " . $table_name . " WHERE " . $column_name . " LIKE '%" . $mysql->real_escape_string($replace) . "%'");

                if(!$rows)
                    continue;
                    
                foreach($rows->fetch_all(MYSQLI_ASSOC) as $data) {
                    $unserialized_data = @unserialize($data[$column_name]);
                            
                    if($unserialized_data === FALSE) {
                        $update = $mysql->query("UPDATE " . $table_name . " SET " . $column_name . " = REPLACE(" . $column_name . ", '" . $mysql->real_escape_string($replace) . "', '" . $mysql->real_escape_string($replace_with) . "') WHERE " . $primary_key . " = '" . $data[$primary_key] . "'");
                    } else {                            
                        $unserialized_data = recursiveObjectReplace($unserialized_data, $replace, $replace_with);
                        
                        $serialized_data = serialize($unserialized_data);

                        $update = $mysql->query("UPDATE " . $table_name . " SET " . $column_name . " = '" . $mysql->real_escape_string($serialized_data) . "' WHERE " . $primary_key . " = '" . $data[$primary_key] . "'");
                    }
                }
            }
        }
    }
}

$mysql->close();

