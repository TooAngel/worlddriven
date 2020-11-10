from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy_utils import EncryptedType
from sqlalchemy_utils.types.encrypted.encrypted_type import AesEngine
import uuid
import os
import sqlalchemy as sa

db = SQLAlchemy()


class Repository(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    full_name = db.Column(sa.String(128), unique=True, nullable=False)
    github_access_token = db.Column(EncryptedType(db.String, os.getenv('ENCRYPTION_KEY'), AesEngine, 'pkcs5'))


class User(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    github_access_token = db.Column(EncryptedType(db.String, os.getenv('ENCRYPTION_KEY'), AesEngine, 'pkcs5'))
