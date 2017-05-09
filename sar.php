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
        'name' => 'search',
        'opts' => [
            '--search'
        ]
    ],
    [
        'name' => 'replace',
        'opts' => [
            '--replace'
        ]
    ],
    [
        'name' => 'replace-json',
        'opts' => [
            '--replace-json'
        ]
    ],
    [
        'name' => 'regexp',
        'opts' => [
            '--regexp'
        ],
        'need_value' => false,
        'optional' => true
    ],
    [
        'name' => 'verbose',
        'opts' => [
            '--verbose'
        ],
        'need_value' => false,
        'optional' => true
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

    if(basename($arguments[0]) == basename(__FILE__))
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
                $arg = ltrim($arg, '--');
                $output_data[$arg] = true;
            }

        } else {
            $output_data[$last_name] = $arg;
            $last_was_name = false;
        }
    }

    return $output_data;
}

function recursiveObjectReplace ($object, $search, $replace = "", $regexp = false) {
    $output_data = "";
    if(is_string($object)) {
        if($regexp) {
            $output_data = preg_replace("/" . $search . "/", $replace, $object);
        } else {
            $output_data = str_replace($search, $replace, $object);
        }
    } else if(is_array($object)) {
        $output_data = array();
        foreach($object as $key => $value) {
            $output_data[$key] = recursiveObjectReplace($value, $search, $replace, $regexp);
        }
    } else if(is_object($object)) {
        $output_data = $object;
        $object = get_object_vars($object);
        foreach($object as $key => $value) {
            $output_data->$key = recursiveObjectReplace($value, $search, $replace, $regexp);
        }
    } else {
        $output_data = $object;
    }

    return $output_data;
}

$arguments = getArgumentData($argv);

$username = $arguments['user'];
$password = (isset($arguments['password'])) ? $arguments['password'] : '';
$port     = (isset($arguments['port'])) ? $arguments['port'] : 3306 ;
$database = $arguments['database'];
$host = (isset($arguments['host'])) ? $arguments['host'] : 'localhost';

if(empty($username) || empty($database)) {
    die("No username or database specified.");
}

$mysql = new mysqli($host, $username, $password, $database, $port);

if($mysql->connect_error) {
    die("Error connecting to mysql. (" . $mysql->connect_error . ")");
}

$search = (string) $arguments['search'];
$replace = (string) $arguments['replace'];

$column_type_like = '';
if(preg_match("/[a-zA-Z]/", $search.$replace)) {
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

$updated_rows = 0;

if($tables && !empty($search) && !empty($replace)) {
    foreach($tables->fetch_all(MYSQLI_ASSOC) as $table) {
        $table_name = $table['TABLE_NAME'];

        $primary_key = $mysql->query("SHOW INDEX FROM " . $table_name . " WHERE Key_name = 'PRIMARY'")->fetch_array()['Column_name'];

        if(isset($arguments['verbose']) && $arguments['verbose']) {
            echo $table_name . "\n";
        }

        if($primary_key) {
            $columns = $mysql->query("SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '" . $mysql->real_escape_string($database) . "' AND TABLE_NAME = '" . $table_name . "'" . $column_type_like);

            if(!$columns)
                continue;

            foreach($columns->fetch_all(MYSQLI_ASSOC) as $column) {

                $column_name = $column['COLUMN_NAME'];
                $column_type = $column['COLUMN_TYPE'];

                $like_sql = "LIKE '%" . $mysql->real_escape_string($search) . "%'";

                if(isset($arguments['regexp']) && $arguments['regexp'])
                    $like_sql = "REGEXP '" . $mysql->real_escape_string($search) . "'";

                $rows = $mysql->query("SELECT " . $primary_key . ", " . $column_name . " FROM " . $table_name . " WHERE " . $column_name . " " . $like_sql);

                if(!$rows)
                    continue;

                foreach($rows->fetch_all(MYSQLI_ASSOC) as $data) {
                    $unserialized_data = @unserialize($data[$column_name]);

                    if($unserialized_data === FALSE) {
                        if(isset($arguments['regexp']) && $arguments['regexp']) {
                            $new_data = preg_replace("/" . $search . "/", $replace, $data[$column_name]);

                            $update = $mysql->query("UPDATE " . $table_name . " SET " . $column_name . " = '" . $mysql->real_escape_string($new_data) . "' WHERE " . $primary_key . " = '" . $data[$primary_key] . "'");
                        } else {
                            $update = $mysql->query("UPDATE " . $table_name . " SET " . $column_name . " = REPLACE(" . $column_name . ", '" . $mysql->real_escape_string($search) . "', '" . $mysql->real_escape_string($replace) . "') WHERE " . $primary_key . " = '" . $data[$primary_key] . "'");
                        }
                    } else {

                        $unserialized_data = recursiveObjectReplace($unserialized_data, $search, $replace, (isset($arguments['regexp']) && $arguments['regexp']));

                        $serialized_data = serialize($unserialized_data);

                        $update = $mysql->query("UPDATE " . $table_name . " SET " . $column_name . " = '" . $mysql->real_escape_string($serialized_data) . "' WHERE " . $primary_key . " = '" . $data[$primary_key] . "'");
                    }

                    if($update) {
                        $updated_rows += $mysql->affected_rows;
                    }
                }
            }
        }
    }
}

echo $updated_rows;

$mysql->close();

