#!/bin/bash
set -e

# Helper function to create user and database
create_service_db() {
    local db_name=$1
    local db_user=$2
    local db_pass=$3

    echo "Creating database '$db_name' and user '$db_user'..."
    
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        CREATE USER $db_user WITH PASSWORD '$db_pass';
        CREATE DATABASE $db_name OWNER $db_user;
        GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;
EOSQL
}

# Run initialization for each microservice database
create_service_db "$AUTH_DB_NAME" "$AUTH_DB_USER" "$AUTH_DB_PASSWORD"
create_service_db "$LEDGER_DB_NAME" "$LEDGER_DB_USER" "$LEDGER_DB_PASSWORD"
create_service_db "$PAYMENTS_DB_NAME" "$PAYMENTS_DB_USER" "$PAYMENTS_DB_PASSWORD"
create_service_db "$FRAUD_DB_NAME" "$FRAUD_DB_USER" "$FRAUD_DB_PASSWORD"

echo "All service databases initialized successfully."