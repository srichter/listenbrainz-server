# coding=utf-8
import calendar
import time
import ujson
import yaml
from copy import deepcopy

from datetime import datetime
from listenbrainz.utils import escape


def flatten_dict(d, seperator='', parent_key=''):
    """
    Flattens a nested dictionary structure into a single dict.

    Args:
        d: the dict to be flattened
        seperator: the seperator used in keys in the flattened dict
        parent_key: the key that is prefixed to all keys generated during flattening

    Returns:
        Flattened dict with keys such as key1.key2
    """
    result = []
    for key, value in d.items():
        new_key = "{}{}{}".format(parent_key, seperator, str(key))
        if isinstance(value, dict):
            result.extend(list(flatten_dict(value, '.', new_key).items()))
        else:
            result.append((new_key, value))
    return dict(result)


def convert_comma_seperated_string_to_list(string):
    if not string:
        return []
    if isinstance(string, list):
        return string
    return [val for val in string.split(',')]


class Listen(object):
    """ Represents a listen object """

    # keys that we use ourselves for private usage
    PRIVATE_KEYS = (
        'inserted_timestamp',
    )

    # keys in additional_info that we support explicitly and are not superfluous
    SUPPORTED_KEYS = (
        'artist_mbids',
        'release_group_mbid',
        'release_mbid',
        'recording_mbid',
        'track_mbid',
        'work_mbids',
        'tracknumber',
        'isrc',
        'spotify_id',
        'tags',
        'artist_msid',
        'release_msid',
        'recording_msid',
    )

    TOP_LEVEL_KEYS = (
        'time',
        'user_name',
        'artist_name',
        'track_name',
        'release_name',
    )

    def __init__(self, user_id=None, user_name=None, timestamp=None, artist_msid=None, release_msid=None,
                 recording_msid=None, dedup_tag=0, inserted_timestamp=None, data=None):
        self.user_id = user_id
        self.user_name = user_name

        # determine the type of timestamp and do the right thing
        if isinstance(timestamp, int) or isinstance(timestamp, float):
            self.ts_since_epoch = int(timestamp)
            self.timestamp = datetime.utcfromtimestamp(self.ts_since_epoch)
        else:
            if timestamp:
                self.timestamp = timestamp
                self.ts_since_epoch = calendar.timegm(self.timestamp.utctimetuple())
            else:
                self.timestamp = None
                self.ts_since_epoch = None

        self.artist_msid = artist_msid
        self.release_msid = release_msid
        self.recording_msid = recording_msid
        self.dedup_tag = dedup_tag
        self.inserted_timestamp = inserted_timestamp
        if data is None:
            self.data = {'additional_info': {}}
        else:
            try:
                flattened_data = flatten_dict(data['additional_info'])
                data['additional_info'] = flattened_data
            except TypeError:
                # TypeError may occur here because PostgresListenStore passes strings
                # to data sometimes. If that occurs, we don't need to do anything.
                pass

            self.data = data

    @classmethod
    def from_json(cls, j):
        """Factory to make Listen() objects from a dict"""

        # Let's go play whack-a-mole with our lovely whicket of timestamp fields. Hopefully one will work!
        try:
            j['listened_at'] = datetime.utcfromtimestamp(float(j['listened_at']))
        except KeyError:
            try:
                j['listened_at'] = datetime.utcfromtimestamp(float(j['timestamp']))
            except KeyError:
                j['listened_at'] = datetime.utcfromtimestamp(float(j['ts_since_epoch']))

        return cls(
            user_id=j.get('user_id'),
            user_name=j.get('user_name', ''),
            timestamp=j['listened_at'],
            artist_msid=j['track_metadata']['additional_info'].get('artist_msid'),
            release_msid=j['track_metadata']['additional_info'].get('release_msid'),
            recording_msid=j.get('recording_msid'),
            dedup_tag=j.get('dedup_tag', 0),
            data=j.get('track_metadata')
        )

    @classmethod
    def from_timescale(cls, listened_at, track_name, user_name, created, j,
                       recording_mbid=None, release_mbid=None, artist_mbids=None):
        """Factory to make Listen() objects from a timescale dict"""

        j['listened_at'] = datetime.utcfromtimestamp(float(listened_at))
        j['track_metadata']['track_name'] = track_name
        if recording_mbid is not None and release_mbid is not None and artist_mbids is not None:
            j["track_metadata"]["mbid_mapping"] = {
                "recording_mbid": str(recording_mbid),
                "release_mbid": str(release_mbid),
                "artist_mbids": [ str(m) for m in artist_mbids ] }
        return cls(
            user_id=j.get('user_id'),
            user_name=user_name,
            timestamp=j['listened_at'],
            artist_msid=j['track_metadata']['additional_info'].get('artist_msid'),
            release_msid=j['track_metadata']['additional_info'].get('release_msid'),
            recording_msid=j['track_metadata']['additional_info'].get('recording_msid'),
            dedup_tag=j.get('dedup_tag', 0),
            inserted_timestamp=created,
            data=j.get('track_metadata')
        )

    def to_api(self):
        """
        Converts listen into the format in which listens are returned in the payload by the api
        on get_listen requests

        Returns:
            dict with fields 'track_metadata', 'listened_at' and 'recording_msid'
        """
        track_metadata = self.data.copy()
        track_metadata['additional_info']['artist_msid'] = self.artist_msid
        track_metadata['additional_info']['release_msid'] = self.release_msid

        data = {
            'track_metadata': track_metadata,
            'listened_at': self.ts_since_epoch,
            'recording_msid': self.recording_msid,
            'user_name': self.user_name,
            'inserted_at' : self.inserted_timestamp or 0
        }

        return data

    def to_json(self):
        return {
            'user_id': self.user_id,
            'user_name': self.user_name,
            'timestamp': self.timestamp,
            'track_metadata': self.data,
            'recording_msid': self.recording_msid
        }

    def to_timescale(self):
        track_metadata = deepcopy(self.data)
        track_metadata['additional_info']['artist_msid'] = self.artist_msid
        track_metadata['additional_info']['release_msid'] = self.release_msid
        track_metadata['additional_info']['recording_msid'] = self.recording_msid
        track_name = track_metadata['track_name']
        del track_metadata['track_name']
        return (self.ts_since_epoch, track_name, self.user_name, ujson.dumps({
            'user_id': self.user_id,
            'track_metadata': track_metadata
        }))

    def validate(self):
        return (self.user_id is not None and self.timestamp is not None and self.artist_msid is not None
                and self.recording_msid is not None and self.data is not None)

    @property
    def date(self):
        return self.timestamp

    def __repr__(self):
        from pprint import pformat
        return pformat(vars(self))

    def __unicode__(self):
        return "<Listen: user_name: %s, time: %s, artist_msid: %s, release_msid: %s, recording_msid: %s, artist_name: %s, track_name: %s>" % \
               (self.user_name, self.ts_since_epoch, self.artist_msid, self.release_msid, self.recording_msid, self.data['artist_name'], self.data['track_name'])


class NowPlayingListen:
    """Represents a now playing listen"""

    def __init__(self, user_id=None, user_name=None, data=None):
        self.user_id = user_id
        self.user_name = user_name

        if data is None:
            self.data = {'additional_info': {}}
        else:
            # submitted listens always has an additional_info key in track_metadata
            # because of the msb lookup. now playing listens do not have a msb lookup
            # so the additional_info key may not always be present.
            additional_info = data.get('additional_info', {})
            data['additional_info'] = flatten_dict(additional_info)
            self.data = data

    def to_api(self):
        return {
            "track_metadata": self.data,
            "playing_now": True
        }

    def __repr__(self):
        from pprint import pformat
        return pformat(vars(self))

    def __str__(self):
        return "<Now Playing Listen: user_name: %s, artist_name: %s, track_name: %s>" % \
               (self.user_name, self.data['artist_name'], self.data['track_name'])


def convert_dump_row_to_spark_row(row):
    data = {
        'listened_at': str(datetime.utcfromtimestamp(row['timestamp'])),
        'user_name': row['user_name'],
        'artist_msid': row['track_metadata']['additional_info']['artist_msid'],
        'artist_name': row['track_metadata'].get('artist_name', ''),
        'artist_mbids': convert_comma_seperated_string_to_list(row['track_metadata']['additional_info'].get('artist_mbids', '')),
        'release_msid': row['track_metadata']['additional_info'].get('release_msid', ''),
        'release_name': row['track_metadata'].get('release_name', ''),
        'release_mbid': row['track_metadata']['additional_info'].get('release_mbid', ''),
        'track_name': row['track_metadata']['track_name'],
        'recording_msid': row['recording_msid'],
        'recording_mbid': row['track_metadata']['additional_info'].get('recording_mbid', ''),
        'tags': convert_comma_seperated_string_to_list(row['track_metadata']['additional_info'].get('tags', [])),
    }

    if 'inserted_timestamp' in row and row['inserted_timestamp'] is not None:
        data['inserted_timestamp'] = str(datetime.utcfromtimestamp(row['inserted_timestamp']))
    else:
        data['inserted_timestamp'] = str(datetime.utcfromtimestamp(0))

    return data
