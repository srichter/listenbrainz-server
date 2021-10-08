import json
import pika
import time
import threading

import ujson

from listenbrainz.listen import Listen, NowPlayingListen
from listenbrainz.utils import get_fallback_connection_name

from flask import current_app
from listenbrainz.webserver.views.api_tools import LISTEN_TYPE_PLAYING_NOW, LISTEN_TYPE_IMPORT


class ListensDispatcher(threading.Thread):

    def __init__(self, app, socketio):
        threading.Thread.__init__(self)
        self.app = app
        self.socketio = socketio

    def send_listens(self, listens, listen_type):
        if listen_type == LISTEN_TYPE_PLAYING_NOW:
            event_name = 'playing_now'
        else:
            event_name = 'listen'
        for listen in listens:
            self.socketio.emit(event_name, json.dumps(listen), to=listen['user_name'])

    def callback_listen(self, channel, method, properties, body):
        listens = [Listen.from_json(listen).to_api() for listen in ujson.loads(body)]
        self.send_listens(listens, LISTEN_TYPE_IMPORT)
        channel.basic_ack(delivery_tag=method.delivery_tag)

    def callback_playing_now(self, channel, method, properties, body):
        listens = [
            NowPlayingListen(
                user_id=listen["user_id"],
                user_name=listen["user_name"],
                data=listen["data"]
            ).to_api() for listen in ujson.loads(body)]
        self.send_listens(listens, LISTEN_TYPE_PLAYING_NOW)
        channel.basic_ack(delivery_tag=method.delivery_tag)

    def create_and_bind_exchange_and_queue(self, channel, exchange, queue):
        channel.exchange_declare(exchange=exchange, exchange_type='fanout')
        channel.queue_declare(callback=lambda x: None, queue=queue, durable=True)
        channel.queue_bind(callback=lambda x: None, exchange=exchange, queue=queue)

    def on_open_callback(self, channel):
        self.create_and_bind_exchange_and_queue(channel, current_app.config['UNIQUE_EXCHANGE'], current_app.config['WEBSOCKETS_QUEUE'])
        channel.basic_consume(queue=current_app.config['WEBSOCKETS_QUEUE'], on_message_callback=self.callback_listen)

        self.create_and_bind_exchange_and_queue(channel, current_app.config['PLAYING_NOW_EXCHANGE'], current_app.config['PLAYING_NOW_QUEUE'])
        channel.basic_consume(queue=current_app.config['PLAYING_NOW_QUEUE'], on_message_callback=self.callback_playing_now)

    def on_open(self, connection):
        connection.channel(on_open_callback=self.on_open_callback)

    def init_rabbitmq_connection(self):
        while True:
            try:
                credentials = pika.PlainCredentials(current_app.config['RABBITMQ_USERNAME'], current_app.config['RABBITMQ_PASSWORD'])
                connection_parameters = pika.ConnectionParameters(
                    host=current_app.config['RABBITMQ_HOST'],
                    port=current_app.config['RABBITMQ_PORT'],
                    virtual_host=current_app.config['RABBITMQ_VHOST'],
                    credentials=credentials,
                    client_properties={"connection_name": get_fallback_connection_name()}
                )
                self.connection = pika.SelectConnection(parameters=connection_parameters, on_open_callback=self.on_open)
                break
            except Exception as e:
                current_app.logger.error("Error while connecting to RabbitMQ: %s", str(e), exc_info=True)
                time.sleep(3)

    def run(self):
        with self.app.app_context():
            while True:
                current_app.logger.info("Starting player writer...")
                self.init_rabbitmq_connection()
                try:
                    self.connection.ioloop.start()
                except KeyboardInterrupt:
                    current_app.logger.error("Keyboard interrupt!")
                    break
                except Exception as e:
                    current_app.logger.error("Error in PlayerWriter: %s", str(e), exc_info=True)
                    time.sleep(3)
