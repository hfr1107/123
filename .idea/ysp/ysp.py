# -*- coding: utf-8 -*-
import json
import re
import sys
import time
import hashlib
import requests
import base64
import urllib.parse
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_v1_5
sys.path.append('..')
from base.spider import Spider


class Spider(Spider):
    # 常量定义
    APP_ID = '5f39826474a524f95d5f436eacfacfb67457c4a7'
    APP_VERSION = '1.3.7'
    UA = 'cctv_app_tv'
    REFERER = 'api.cctv.cn'
    PUB_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/ZeLwTPPLSU7QGwv6tVgdawz9n7S2CxboIEVQlQ1USAHvBRlWBsU2l7+HuUVMJ5blqGc/5y3AoaUzPGoXPfIm0GnBdFL+iLeRDwOS1KgcQ0fIquvr/2Xzj3fVA1o4Y81wJK5BP8bDTBFYMVOlOoCc1ZzWwdZBYpb4FNxt//5dAwIDAQAB'
    URL_CLOUDWS_REGISTER = 'https://ytpcloudws.cctv.cn/cloudps/wssapi/device/v1/register'
    URL_GET_BASE = 'https://ytpaddr.cctv.cn/gsnw/live'
    URL_GET_APP_SECRET = 'https://ytpaddr.cctv.cn/gsnw/tpa/sk/obtain'
    URL_GET_STREAM = 'https://ytpvdn.cctv.cn/cctvmobileinf/rest/cctv/videoliveUrl/getstream'
    
    # CCTV 频道列表
    cctv_list = {
        'cctv1':    'Live1717729995180256',
        'cctv2':    'Live1718261577870260',
        'cctv3':    'Live1718261955077261',
        'cctv4':    'Live1718276148119264',
        'cctv5':    'Live1719474204987287',
        'cctv5p':   'Live1719473996025286',
        'cctv7':    'Live1718276412224269',
        'cctv8':    'Live1718276458899270',
        'cctv9':    'Live1718276503187272',
        'cctv10':   'Live1718276550002273',
        'cctv11':   'Live1718276603690275',
        'cctv12':   'Live1718276623932276',
        'cctv13':   'Live1718276575708274',
        'cctv14':   'Live1718276498748271',
        'cctv15':   'Live1718276319614267',
        'cctv16':   'Live1718276256572265',
        'cctv17':   'Live1718276138318263',
        'cgtnen':   'Live1719392219423280',
        'cgtnfr':   'Live1719392670442283',
        'cgtnru':   'Live1719392779653284',
        'cgtnar':   'Live1719392885692285',
        'cgtnes':   'Live1719392560433282',
        'cgtndoc':  'Live1719392360336281',
        'cctv4k16': 'Live1704966749996185',
        'cctv4k':   'Live1704872878572161',
        'cctv8k':   'Live1688400593818102',
    }
    
    def getName(self):
        return "CCTV直播"

    def init(self, extend):
        try:
            self.extendDict = json.loads(extend)
        except:
            self.extendDict = {}

        proxy = self.extendDict.get('proxy', None)
        if proxy is None:
            self.is_proxy = False
        else:
            self.proxy = proxy
            self.is_proxy = True
            
        self.headers = {
            'User-Agent': self.UA,
            'Referer': self.REFERER
        }
        
        # 默认参数
        self.default_uid = '12b611e9210b7fb3'
        self.default_guid = 'mei7mbvj_00000e539a6'
        
        # 加载公钥
        self.pub_key = RSA.importKey(f"-----BEGIN PUBLIC KEY-----\n{self.PUB_KEY}\n-----END PUBLIC KEY-----")
        self.cipher = PKCS1_v1_5.new(self.pub_key)

    def getDependence(self):
        return []

    def isVideoFormat(self, url):
        return url.endswith(('.m3u8', '.ts'))

    def manualVideoCheck(self):
        return True

    def liveContent(self, url):
        """生成CCTV频道列表的M3U8内容"""
        tv_list = ['#EXTM3U']
        for name, live_id in self.cctv_list.items():
            tv_list.append(f'#EXTINF:-1 tvg-id="{name}" tvg-name="CCTV {name[3:]}" group-title="CCTV",{name.upper()}')
            tv_list.append(f'{self.getProxyUrl()}&fun=cctv&pid={live_id}')
        return '\n'.join(tv_list)

    def homeContent(self, filter):
        return {}

    def homeVideoContent(self):
        return {}

    def categoryContent(self, cid, page, filter, ext):
        return {}

    def detailContent(self, did):
        return {}

    def searchContent(self, key, quick, page='1'):
        return {}

    def searchContentPage(self, keywords, quick, page):
        return {}

    def playerContent(self, flag, pid, vipFlags):
        return {}

    def localProxy(self, params):
        _fun = params.get('fun', None)
        _type = params.get('type', None)

        if _fun is not None:
            fun = getattr(self, f'fun_{_fun}', None)
            if fun:
                return fun(params)

        if _type is not None:
            if params['type'] == "m3u8":
                return self.get_m3u8_text(params)
            if params['type'] == "ts":
                return self.get_ts(params)

        return [302, "text/plain", None, {'Location': 'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/xgplayer_doc_video/mp4/xgplayer-demo-720p.mp4'}]
    
    def fun_cctv(self, params):
        """处理CCTV直播请求"""
        pid = params.get('pid')
        uid = params.get('uid', self.default_uid)
        guid = params.get('guid', self.default_guid)
        
        # 获取M3U8内容
        try:
            m3u8_content = self.get_m3u8_content(pid, uid, guid)
            return [200, "application/vnd.apple.mpegurl", m3u8_content]
        except Exception as e:
            return [500, "text/plain", str(e)]
    
    def get_m3u8_content(self, live_id, uid, guid):
        """获取处理后的M3U8内容"""
        app_secret = self.get_app_secret(guid, uid)
        base_url = self.get_base_m3u_url(live_id, uid)
        m3u8_content = self.get_stream_m3u8(base_url, uid, guid, app_secret)
        
        # 解析基础URL
        parsed_url = urllib.parse.urlparse(base_url)
        base_path = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path.rsplit('/', 1)[0]}/"
        
        # 替换TS链接为代理链接
        def replace_ts(match):
            ts_url = match.group(1)
            if not ts_url.startswith(('http://', 'https://')):
                ts_url = base_path + ts_url
                
            # 使用本地代理处理TS文件
            encoded_url = self.b64encode(ts_url)
            return f"{self.getProxyUrl()}&type=ts&url={encoded_url}"
            
        return re.sub(r'(.*?\.ts\??.*)', replace_ts, m3u8_content)
    
    def get_app_secret(self, guid, uid):
        """获取应用密钥"""
        encrypted_guid = self.encrypt_by_public_key(guid)
        data = json.dumps({'guid': encrypted_guid})
        
        headers = {
            'Accept': 'application/json',
            'UID': uid,
            'Referer': self.REFERER,
            'User-Agent': self.UA,
            'Content-Type': 'application/json',
        }
        
        response = self.http_post(self.URL_GET_APP_SECRET, data, headers)
        result = json.loads(response)
        return self.decrypt_by_public_key(result['data']['appSecret'])
    
    def get_base_m3u_url(self, live_id, uid):
        """获取基础M3U URL"""
        data = json.dumps({
            'rate': '',
            'systemType': 'android',
            'model': '',
            'id': live_id,
            'userId': '',
            'clientSign': 'cctvVideo',
            'deviceId': {
                'serial': '',
                'imei': '',
                'android_id': uid,
            },
        })
        
        headers = {
            'Accept': 'application/json',
            'UID': uid,
            'Referer': self.REFERER,
            'User-Agent': self.UA,
            'Content-Type': 'application/json',
        }
        
        response = self.http_post(self.URL_GET_BASE, data, headers)
        result = json.loads(response)
        return result['data']['videoList'][0]['url']
    
    def get_stream_m3u8(self, base_url, uid, guid, app_secret):
        """获取最终的M3U8内容"""
        app_random_str = hashlib.md5(str(time.time()).encode()).hexdigest()[:16]
        app_sign = hashlib.md5(f"{self.APP_ID}{app_secret}{app_random_str}".encode()).hexdigest()
        
        data = {
            'appcommon': json.dumps({
                'adid': uid,
                'av': self.APP_VERSION,
                'an': '央视视频电视投屏助手',
                'ap': self.UA
            }),
            'url': base_url
        }
        
        headers = {
            'User-Agent': self.UA,
            'Referer': self.REFERER,
            'UID': uid,
            'APPID': self.APP_ID,
            'APPSIGN': app_sign,
            'APPRANDOMSTR': app_random_str,
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        
        response = self.http_post(self.URL_GET_STREAM, urllib.parse.urlencode(data), headers)
        result = json.loads(response)
        stream_url = result['url']
        
        # 获取原始M3U8内容
        if self.is_proxy:
            resp = requests.get(stream_url, headers=headers, proxies=self.proxy, timeout=10)
        else:
            resp = requests.get(stream_url, headers=headers, timeout=10)
        
        return resp.text
    
    def get_m3u8_text(self, params):
        """获取M3U8文本内容"""
        url = self.b64decode(params['url'])
        headers = self.headers
        
        if self.is_proxy:
            response = requests.get(url, headers=headers, proxies=self.proxy)
        else:
            response = requests.get(url, headers=headers)
            
        return [200, "application/vnd.apple.mpegurl", response.text]
    
    def get_ts(self, params):
        """获取TS文件内容，支持断点续传"""
        url = self.b64decode(params['url'])
        headers = self.headers.copy()
        
        # 处理断点续传
        range_header = params.get('HTTP_RANGE')
        if range_header:
            headers['Range'] = range_header
            
        try:
            if self.is_proxy:
                response = requests.get(url, headers=headers, proxies=self.proxy, stream=True)
            else:
                response = requests.get(url, headers=headers, stream=True)
                
            content_type = response.headers.get('Content-Type', 'video/MP2T')
            status_code = response.status_code
            headers = {}
            
            # 传递必要的响应头
            if 'Content-Length' in response.headers:
                headers['Content-Length'] = response.headers['Content-Length']
            if 'Content-Range' in response.headers:
                headers['Content-Range'] = response.headers['Content-Range']
                
            return [status_code, content_type, response.content, headers]
        except Exception as e:
            return [500, "text/plain", str(e)]
    
    def http_post(self, url, data, headers):
        """发送POST请求"""
        try:
            if self.is_proxy:
                response = requests.post(url, data=data, headers=headers, proxies=self.proxy, timeout=10)
            else:
                response = requests.post(url, data=data, headers=headers, timeout=10)
            return response.text
        except Exception as e:
            raise Exception(f"HTTP请求失败: {str(e)}")
    
    def encrypt_by_public_key(self, data):
        """使用公钥加密"""
        data_bytes = data.encode('utf-8')
        encrypted = self.cipher.encrypt(data_bytes)
        return base64.b64encode(encrypted).decode('utf-8')
    
    def decrypt_by_public_key(self, encrypted_str):
        """使用公钥解密"""
        encrypted = base64.b64decode(encrypted_str)
        # 分块解密，RSA最大加密长度为密钥长度-42
        max_length = 128 - 42
        decrypted = b""
        for i in range(0, len(encrypted), max_length):
            chunk = encrypted[i:i+max_length]
            decrypted += self.cipher.decrypt(chunk, None)
        return decrypted.decode('utf-8')
    
    def b64encode(self, data):
        return base64.b64encode(data.encode('utf-8')).decode('utf-8')
    
    def b64decode(self, data):
        return base64.b64decode(data.encode('utf-8')).decode('utf-8')

if __name__ == '__main__':
    pass