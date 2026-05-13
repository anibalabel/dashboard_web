<?php
require_once __DIR__ . '/config.php';

class PlusMovieDatabase {
    private $connection;
    private $host;
    private $database;
    private $username;
    private $password;
    private $port;
    private $charset;
    
    public function __construct() {
        $this->host = PLUSMOVIE_DB_HOST;
        $this->database = PLUSMOVIE_DB_DATABASE;
        $this->username = PLUSMOVIE_DB_USERNAME;
        $this->password = PLUSMOVIE_DB_PASSWORD;
        $this->port = PLUSMOVIE_DB_PORT;
        $this->charset = PLUSMOVIE_DB_CHARSET;
    }
    
    public function connect() {
        try {
            $dsn = "mysql:host={$this->host};port={$this->port};dbname={$this->database};charset={$this->charset}";
            $this->connection = new PDO($dsn, $this->username, $this->password);
            $this->connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->connection->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            return $this->connection;
        } catch (PDOException $e) {
            throw new Exception("Error de conexión a la base de datos PlusMovie: " . $e->getMessage());
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
    
    public function generateStreamKey($length = 12) {
        $characters = '0123456789abcdefghijklmnopqrstuvwxyz';
        $key = '';
        for ($i = 0; $i < $length; $i++) {
            $key .= $characters[rand(0, strlen($characters) - 1)];
        }
        return $key;
    }
}
?>
