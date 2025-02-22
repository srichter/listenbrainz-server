import errno
import os
import socket

import pika
import time

from datetime import datetime, timezone
from redis import Redis

def escape(value):
    """ Escapes backslashes, quotes and new lines present in the string value
    """
    return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")


def create_path(path):
    """Creates a directory structure if it doesn't exist yet."""
    try:
        os.makedirs(path)
    except OSError as exception:
        if exception.errno != errno.EEXIST:
            raise Exception("Failed to create directory structure %s. Error: %s" %
                            (path, exception))


def log_ioerrors(logger, e):
    """ Logs IOErrors that occur in case we run out of disk space.
        This is used in data dumps and is a placeholder while Sentry support
        is added.
    """
    logger.error('IOError while creating dump: %s', str(e))


def connect_to_rabbitmq(username, password,
                        host, port, virtual_host,
                        connection_type=pika.BlockingConnection,
                        credentials_type=pika.PlainCredentials,
                        error_logger=print,
                        error_retry_delay=3,
                        heartbeat=None,
                        connection_name: str = None):
    """Connects to RabbitMQ

    Args:
        username, password, host, port, virtual_host
        error_logger: A function used to log failed connections.
        connection_type: A pika Connection class to instantiate.
        credentials_type: A pika Credentials class to use.
        error_retry_delay: How long to wait in seconds before retrying a connection.

    Returns:
        A connection, with type of connection_type.
    """
    while True:
        try:
            if connection_name is None:
                connection_name = get_fallback_connection_name()
            credentials = credentials_type(username, password)
            connection_parameters = pika.ConnectionParameters(
                host=host,
                port=port,
                virtual_host=virtual_host,
                credentials=credentials,
                heartbeat=heartbeat,
                client_properties={"connection_name": connection_name}
            )
            return connection_type(connection_parameters)
        except Exception as err:
            error_message = "Cannot connect to RabbitMQ: {error}, retrying in {delay} seconds."
            error_logger(error_message.format(error=str(err), delay=error_retry_delay))
            time.sleep(error_retry_delay)


def init_cache(host, port, namespace):
    """ Initializes brainzutils cache. """
    from brainzutils import cache
    cache.init(host=host, port=port, namespace=namespace)


def create_channel_to_consume(connection, exchange: str, queue: str, callback_function, auto_ack: bool = False):
    """ Returns a newly created channel that can consume from the specified queue.

    Args:
        connection: a RabbitMQ connection
        exchange: the name of the exchange
        queue: the name of the queue
        callback_function: the callback function to be called on message reception
        auto_ack: should messages be automatically ack'ed when received

    Returns:
        a RabbitMQ channel
    """
    ch = connection.channel()
    ch.exchange_declare(exchange=exchange, exchange_type='fanout')
    ch.queue_declare(queue, durable=True)
    ch.queue_bind(exchange=exchange, queue=queue)
    ch.basic_qos(prefetch_count=1)
    ch.basic_consume(queue=queue, on_message_callback=callback_function, auto_ack=auto_ack)
    return ch


def connect_to_redis(host, port, log=print):
    """ Create a connection to redis and return it

    Note: This is a blocking function which keeps trying to connect to redis until
    it establishes a connection

    Args:
        host: the hostname of the redis server
        port: the port of the redis server
        log: the function to use for error logging

    Returns:
        Redis object
    """
    while True:
        try:
            redis = Redis(host=host, port=port)
            redis.ping()
            return redis
        except Exception as err:
            log("Cannot connect to redis: %s. Retrying in 3 seconds and trying again." % str(err))
            time.sleep(3)

def safely_import_config():
    """ 
        Safely import config.py. If config.py is not found, wait 2 seconds and try again.
    """

    while True:
        try:
            from listenbrainz import config
            break
        except ImportError:
            print("Cannot import config.py. Waiting and retrying...")
            time.sleep(2)

def unix_timestamp_to_datetime(timestamp):
    """ Converts expires_at timestamp received from Spotify to a datetime object

    Args:
        timestamp (int): the unix timestamp to be converted to datetime

    Returns:
        A datetime object with timezone UTC corresponding to the provided timestamp
    """
    return datetime.utcfromtimestamp(timestamp).replace(tzinfo=timezone.utc)

def get_fallback_connection_name():
    """ Get a connection name friendlier than docker gateway ip during connecting
    to services like redis, rabbitmq etc."""
    # We use CONTAINER_NAME environment variable, this is always set in production.
    # Finally, we fall back to the host name, not as informative as the container name
    # but something is better than nothing.
    client_name = os.getenv("CONTAINER_NAME", None)
    if client_name is None:
        client_name = socket.gethostname()
    return client_name
