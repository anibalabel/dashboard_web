<?php
require_once 'config.php';

class DooplexDatabase {
    private $connection;
    private $host;
    private $database;
    private $username;
    private $password;
    private $port;
    private $charset;
    
    public function __construct() {
        $this->host = DOOPLEX_DB_HOST;
        $this->database = DOOPLEX_DB_DATABASE;
        $this->username = DOOPLEX_DB_USERNAME;
        $this->password = DOOPLEX_DB_PASSWORD;
        $this->port = DOOPLEX_DB_PORT;
        $this->charset = DOOPLEX_DB_CHARSET;
    }
    
    public function connect() {
        try {
            $dsn = "mysql:host={$this->host};port={$this->port};dbname={$this->database};charset={$this->charset}";
            $this->connection = new PDO($dsn, $this->username, $this->password);
            $this->connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->connection->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            return $this->connection;
        } catch (PDOException $e) {
            throw new Exception("Error de conexión a la base de datos Dooplex: " . $e->getMessage());
        }
    }
    
    public function getConnection() {
        if ($this->connection === null) {
            $this->connect();
        }
        return $this->connection;
    }
    
    public function closeConnection() {
        $this->connection = null;
    }
}
?>