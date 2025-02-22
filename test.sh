#!/bin/bash

# Github Actions automatically sets the CI environment variable. We use this variable to detect if the script is running
# inside a CI environment and modify its execution as needed.
if [ "$CI" == "true" ] ; then
    echo "Running in CI mode"
fi

# UNIT TESTS
# ./test.sh                build unit test containers, bring up, make database, test, bring down
# for development:
# ./test.sh -u             build unit test containers, bring up background and load database if needed
# ./test.sh [params]       run unit tests, passing optional params to inner test
# ./test.sh -s             stop unit test containers without removing
# ./test.sh -d             clean unit test containers

# FRONTEND TESTS
# ./test.sh fe             run frontend tests
# ./test.sh fe -u          run frontend tests, update snapshots
# ./test.sh fe -b          build frontend test containers
# ./test.sh fe -t          run type-checker
# ./test.sh fe -f          run linter

# SPARK TESTS
# ./test.sh spark          run spark tests
# ./test.sh spark -b       build spark test containers

# INTEGRATION TESTS
# ./test.sh int            run integration tests

COMPOSE_FILE_LOC=docker/docker-compose.test.yml
COMPOSE_PROJECT_NAME=listenbrainz_test

SPARK_COMPOSE_FILE_LOC=docker/docker-compose.spark.yml
SPARK_COMPOSE_PROJECT_NAME=listenbrainz_spark_test

INT_COMPOSE_FILE_LOC=docker/docker-compose.integration.yml
INT_COMPOSE_PROJECT_NAME=listenbrainz_int


if [[ ! -d "docker" ]]; then
    echo "This script must be run from the top level directory of the listenbrainz-server source."
    exit 255
fi

function build_unit_containers {
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                build lb_db redis rabbitmq listenbrainz
}

function bring_up_unit_db {
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                up -d lb_db redis rabbitmq
}

function unit_setup {
    echo "Running setup"
    # PostgreSQL Database initialization
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                run --rm listenbrainz dockerize \
                  -wait tcp://lb_db:5432 -timeout 60s \
                  -wait tcp://rabbitmq:5672 -timeout 60s \
                bash -c "python3 manage.py init_db --create-db && \
                         python3 manage.py init_msb_db --create-db && \
                         python3 manage.py init_ts_db --create-db"
}

function is_unit_db_running {
    # Check if the database container is running
    containername="${COMPOSE_PROJECT_NAME}_lb_db_1"
    res=`docker ps --filter "name=$containername" --filter "status=running" -q`
    if [ -n "$res" ]; then
        return 0
    else
        return 1
    fi
}

function is_unit_db_exists {
    containername="${COMPOSE_PROJECT_NAME}_lb_db_1"
    res=`docker ps --filter "name=$containername" --filter "status=exited" -q`
    if [ -n "$res" ]; then
        return 0
    else
        return 1
    fi
}

function unit_stop {
    # Stopping all unit test containers associated with this project
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                stop
}

function unit_dcdown {
    # Shutting down all unit test containers associated with this project
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                down
}

function build_frontend_containers {
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                build frontend_tester
}

function update_snapshots {
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                run --rm frontend_tester npm run test:update-snapshots
}

function run_lint_check {
    if [ "$CI" == "true" ] ; then
        command="format:ci"
    else
        command="format"
    fi

    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                run --rm frontend_tester npm run $command
}

function run_frontend_tests {
    if [ "$CI" == "true" ] ; then
        command="test:ci"
    else
        command="test"
    fi
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                run --rm frontend_tester npm run $command
}

function run_type_check {
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                run --rm frontend_tester npm run type-check
}

function spark_setup {
    echo "Running spark test setup"
    docker-compose -f $SPARK_COMPOSE_FILE_LOC \
                   -p $SPARK_COMPOSE_PROJECT_NAME \
                  up -d namenode datanode
}

function build_spark_containers {
    docker-compose -f $SPARK_COMPOSE_FILE_LOC \
                   -p $SPARK_COMPOSE_PROJECT_NAME \
                build namenode
}

function spark_dcdown {
    # Shutting down all spark test containers associated with this project
    docker-compose -f $SPARK_COMPOSE_FILE_LOC \
                   -p $SPARK_COMPOSE_PROJECT_NAME \
                down
}

function int_build {
    docker-compose -f $INT_COMPOSE_FILE_LOC \
                   -p $INT_COMPOSE_PROJECT_NAME \
                build
}

function int_dcdown {
    # Shutting down all integration test containers associated with this project
    docker-compose -f $INT_COMPOSE_FILE_LOC \
                   -p $INT_COMPOSE_PROJECT_NAME \
                down
}

function int_setup {
    echo "Running setup"
    docker-compose -f $INT_COMPOSE_FILE_LOC \
                   -p $INT_COMPOSE_PROJECT_NAME \
                run --rm listenbrainz dockerize \
                  -wait tcp://lb_db:5432 -timeout 60s \
                bash -c "python3 manage.py init_db --create-db && \
                         python3 manage.py init_msb_db --create-db && \
                         python3 manage.py init_ts_db --create-db"
}

function bring_up_int_containers {
    docker-compose -f $INT_COMPOSE_FILE_LOC \
                   -p $INT_COMPOSE_PROJECT_NAME \
                up -d lb_db redis timescale_writer rabbitmq
}

# Exit immediately if a command exits with a non-zero status.
# set -e
# trap cleanup EXIT  # Cleanup after tests finish running

if [ "$1" == "spark" ]; then
    if [ "$2" == "-b" ]; then
        echo "Building containers"
        build_spark_containers
        exit 0
    fi

    spark_setup
    echo "Running tests"
    docker-compose -f $SPARK_COMPOSE_FILE_LOC \
                   -p $SPARK_COMPOSE_PROJECT_NAME \
                run --rm request_consumer
    RET=$?
    spark_dcdown
    exit $RET
fi

if [ "$1" == "int" ]; then
    echo "Taking down old containers"
    int_dcdown
    echo "Building current setup"
    int_build
    echo "Building containers"
    int_setup
    echo "Bringing containers up"
    bring_up_int_containers
    shift
    if [ -z "$@" ]; then
        TESTS_TO_RUN="listenbrainz/tests/integration"
    else
        TESTS_TO_RUN="$@"
    fi
    echo "Running tests $TESTS_TO_RUN"

    docker-compose -f $INT_COMPOSE_FILE_LOC \
                   -p $INT_COMPOSE_PROJECT_NAME \
                run --rm listenbrainz dockerize \
                  -wait tcp://lb_db:5432 -timeout 60s \
                  -wait tcp://redis:6379 -timeout 60s \
                  -wait tcp://rabbitmq:5672 -timeout 60s \
                bash -c "pytest $TESTS_TO_RUN"
    RET=$?
    echo "Taking containers down"
    int_dcdown
    exit $RET
fi

if [ "$1" == "fe" ]; then
    if [ "$2" == "-u" ]; then
        echo "Running tests and updating snapshots"
        update_snapshots
        exit 0
    fi

    if [ "$2" == "-b" ]; then
        echo "Building containers"
        build_frontend_containers
        exit 0
    fi

    if [ "$2" == "-t" ]; then
        echo "Running type checker"
        run_type_check
        exit $?
    fi

    if [ "$2" == "-f" ]; then
        echo "Running linter"
        run_lint_check
        exit $?
    fi

    echo "Running tests"
    run_frontend_tests
    exit $?
fi

if [ "$1" == "-s" ]; then
    echo "Stopping unit test containers"
    unit_stop
    exit 0
fi

if [ "$1" == "-d" ]; then
    echo "Running docker-compose down"
    unit_dcdown
    exit 0
fi

# if -u flag, bring up db, run setup, quit
if [ "$1" == "-u" ]; then
    is_unit_db_exists
    DB_EXISTS=$?
    is_unit_db_running
    DB_RUNNING=$?
    if [ $DB_EXISTS -eq 0 -o $DB_RUNNING -eq 0 ]; then
        echo "Database is already up, doing nothing"
    else
        echo "Building containers"
        build_unit_containers
        echo "Bringing up DB"
        bring_up_unit_db
        unit_setup
    fi
    exit 0
fi

is_unit_db_exists
DB_EXISTS=$?
is_unit_db_running
DB_RUNNING=$?
if [ $DB_EXISTS -eq 1 -a $DB_RUNNING -eq 1 ]; then
    # If no containers, build them, run setup then run tests, then bring down
    build_unit_containers
    bring_up_unit_db
    unit_setup
    echo "Running tests"
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                run --rm listenbrainz pytest "$@"
    RET=$?
    unit_dcdown
    exit $RET
else
    # Else, we have containers, just run tests
    echo "Running tests"
    docker-compose -f $COMPOSE_FILE_LOC \
                   -p $COMPOSE_PROJECT_NAME \
                run --rm listenbrainz pytest "$@"
    exit $?
fi
