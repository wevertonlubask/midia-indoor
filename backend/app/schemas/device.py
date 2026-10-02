import re
from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, field_validator

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

DeviceCommandName = Literal[
    "restart_browser",
    "reboot",
    "shutdown",
    "tv_on",
    "tv_off",
    "screenshot",
    "update_agent",
    "sync_time",
]


def _check_time(value: Optional[str]) -> Optional[str]:
    if value is not None and not _TIME_RE.match(value):
        raise ValueError("Horário deve estar no formato HH:MM")
    return value


class DeviceSchedule(BaseModel):
    enabled: bool = False
    days: List[int] = [1, 2, 3, 4, 5]
    on_time: str = "07:00"
    off_time: str = "22:30"

    @field_validator("days")
    @classmethod
    def validate_days(cls, v: List[int]) -> List[int]:
        if any(d < 1 or d > 7 for d in v):
            raise ValueError("Dias devem estar entre 1 (segunda) e 7 (domingo)")
        return sorted(set(v))

    @field_validator("on_time", "off_time")
    @classmethod
    def validate_time(cls, v: str) -> str:
        return _check_time(v)


class DeviceSettings(BaseModel):
    schedule: DeviceSchedule = DeviceSchedule()
    daily_restart: Optional[str] = "05:00"
    tv_control: Literal["auto", "cec", "hdmi"] = "auto"

    @field_validator("daily_restart")
    @classmethod
    def validate_restart(cls, v: Optional[str]) -> Optional[str]:
        return _check_time(v or None)


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    screen_id: Optional[str] = None
    settings: Optional[DeviceSettings] = None


class DeviceCommand(BaseModel):
    command: DeviceCommandName


class DeviceRegister(BaseModel):
    mac: str
    hostname: Optional[str] = None
    ip: Optional[str] = None
    agent_version: Optional[str] = None
    enroll_key: Optional[str] = None

    @field_validator("mac")
    @classmethod
    def normalize_mac(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^([0-9a-f]{2}:){5}[0-9a-f]{2}$", v):
            raise ValueError("MAC inválido")
        return v


class DeviceRegisterResponse(BaseModel):
    device_id: str
    token: str


class DeviceResponse(BaseModel):
    id: str
    name: str
    hostname: Optional[str]
    mac: str
    ip: Optional[str]
    screen_id: Optional[str]
    agent_version: Optional[str]
    last_seen_at: Optional[datetime]
    status: Optional[dict]
    settings: Optional[dict]
    last_command: Optional[dict]
    created_at: datetime
    is_online: bool = False

    model_config = {"from_attributes": True}


class DevicePublic(BaseModel):
    id: str
    name: str
    hostname: Optional[str]
    ip: Optional[str]
    code: str
