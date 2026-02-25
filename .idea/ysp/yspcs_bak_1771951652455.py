# -*- coding: utf-8 -*-
import json
import re
import sys
import time
import hashlib
import requests
import base64
import urllib.parse
import os
sys.path.append('..')
from base.spider import Spider

class Spider(Spider):
    # 常量定义
    APP_ID = '5f39826474a524f95d5f436eacfacfb67457c4a7'
    APP_VERSION = '1.3.7'
    UA = 'cctv_app_tv'
    REFERER = 'api.cctv.cn'
    PHP_API_URL = 'http://localhost:8080/ysp/rsa_handler.php'  # PHP接口地址
    
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
            
        # 可以配置PHP接口地址
        self.php_api_url = self.extendDict.get('php_api_url', self.PHP_API_URL)
            
        self.headers = {
            'User-Agent': self.UA,
            'Referer': self.REFERER
        }
        
        # 默认参数
        self.default_uid = '12b611e9210b7fb3'
        
        # 缓存目录
        self.cache_dir = os.path.join(os.path.dirname(__file__), 'cache', 'ysptp', self.default_uid)
        os.makedirs(self.cache_dir, exist_ok=True)

    def get_guid_from_php(self):
        """从PHP接口获取GUID"""
        try:
            response = requests.get(f"{self.php_api_url}?action=guid", timeout=10)
            if response.status_code == 200:
                result = response.json()
                if 'data' in result:
                    return result['data']
        except Exception as e:
            print(f"获取GUID失败: {e}")
        
        # 备用GUID
        return '5533d255662146f7a58ee081b4a51aac'
    
    def encrypt_by_php(self, data):
        """使用PHP接口加密"""
        try:
            response = requests.post(f"{self.php_api_url}?action=encrypt", 
                                   data=data, 
                                   headers={'Content-Type': 'text/plain'},
                                   timeout=10)
            if response.status_code == 200:
                result = response.json()
                if 'data' in result:
                    return result['data']
                elif 'error' in result:
                    print(f"PHP加密错误: {result['error']}")
        except Exception as e:
            print(f"PHP加密请求失败: {e}")
        
        return None
    
    def decrypt_by_php(self, encrypted_str):
        """使用PHP接口解密"""
        try:
            response = requests.post(f"{self.php_api_url}?action=decrypt", 
                                   data=encrypted_str,
                                   headers={'Content-Type': 'text/plain'},
                                   timeout=10)
            if response.status_code == 200:
                result = response.json()
                if 'data' in result:
                    return result['data']
                elif 'error' in result:
                    print(f"PHP解密错误: {result['error']}")
        except Exception as e:
            print(f"PHP解密请求失败: {e}")
        
        return None

    # 其他方法保持不变，只需要修改RSA相关调用
    def get_app_secret(self, guid, uid):
        """获取应用密钥"""
        cache_file = os.path.join(self.cache_dir, f"app_secret_{hashlib.md5((uid + guid).encode()).hexdigest()}.json")
        
        # 检查缓存
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                cache_age = time.time() - cache_data.get('time', 0)
                if cache_age < 120:  # 2分钟缓存
                    return cache_data['data']
            except:
                pass
        
        # 使用PHP接口加密GUID
        encrypted_guid = self.encrypt_by_php(guid)
        if not encrypted_guid:
            raise Exception("GUID加密失败")
            
        data = json.dumps({'guid': encrypted_guid})
        
        headers = {
            'Accept': 'application/json',
            'UID': uid,
            'Referer': self.REFERER,
            'User-Agent': self.UA,
            'Content-Type': 'application/json',
        }
        
        response = self.http_post('https://ytpaddr.cctv.cn/gsnw/tpa/sk/obtain', data, headers)
        result = json.loads(response)
        
        # 使用PHP接口解密appSecret
        app_secret = self.decrypt_by_php(result['data']['appSecret'])
        if not app_secret:
            raise Exception("appSecret解密失败")
        
        # 保存缓存
        cache_data = {
            'data': app_secret,
            'time': time.time()
        }
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f)
        
        return app_secret

    # 其他方法保持不变...
    def getDependence(self):
        return []

    def isVideoFormat(self, url):
        return url.endswith(('.m3u8', '.ts'))

    def manualVideoCheck(self):
        return True

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
        guid = self.get_guid_from_php()  # 从PHP接口获取GUID
        
        print(f"获取直播流: pid={pid}, uid={uid}, guid={guid}")
        
        # 获取M3U8内容
        try:
            m3u8_content = self.get_m3u8_content(pid, uid, guid)
            return [200, "application/vnd.apple.mpegurl", m3u8_content]
        except Exception as e:
            print(f"获取M3U8内容失败: {e}")
            return [500, "text/plain", str(e)]
    
    def get_m3u8_content(self, live_id, uid, guid):
        """获取处理后的M3U8内容"""
        print(f"开始获取直播流: live_id={live_id}")
        
        app_secret = self.get_app_secret(guid, uid)
        print(f"获取到app_secret: {app_secret[:10]}...")
        
        base_url = self.get_base_m3u_url(live_id, uid)
        print(f"获取到base_url: {base_url}")
        
        m3u8_content = self.get_stream_m3u8(base_url, uid, guid, app_secret)
        print(f"获取到原始M3U8内容，长度: {len(m3u8_content)}")
        
        # 解析基础URL
        parsed_url = urllib.parse.urlparse(base_url)
        base_path = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path.rsplit('/', 1)[0]}/"
        
        # 替换TS链接为代理链接
        def replace_ts(match):
            ts_url = match.group(1)
            if not ts_url.startswith(('http://', 'https://')):
                ts_url = base_path + ts_url
                
            # 解析TS URL参数
            parsed_ts = urllib.parse.urlparse(ts_url)
            ts_file = os.path.basename(parsed_ts.path)
            query_params = urllib.parse.parse_qs(parsed_ts.query)
            
            # 提取有效参数
            ws_secret = query_params.get('wsSecret', [''])[0]
            ws_time = query_params.get('wsTime', [''])[0]
            
            # 构建代理参数
            proxy_params = {
                'ts': ts_file,
                'wsSecret': ws_secret,
                'wsTime': ws_time
            }
            
            # 使用本地代理处理TS文件
            return f"{self.getProxyUrl()}&type=ts&{urllib.parse.urlencode(proxy_params)}"
            
        processed_content = re.sub(r'([^\r\n]+\.ts(?:\?[^\r\n]+)?)', replace_ts, m3u8_content, flags=re.IGNORECASE)
        print(f"处理后的M3U8内容，长度: {len(processed_content)}")
        
        return processed_content
    
    def get_base_m3u_url(self, live_id, uid):
        """获取基础M3U URL"""
        cache_file = os.path.join(self.cache_dir, f"base_m3u_{hashlib.md5((uid + live_id).encode()).hexdigest()}.json")
        
        # 检查缓存
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                cache_age = time.time() - cache_data.get('time', 0)
                if cache_age < 120:  # 2分钟缓存
                    return cache_data['data']
            except:
                pass
        
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
        
        response = self.http_post('https://ytpaddr.cctv.cn/gsnw/live', data, headers)
        result = json.loads(response)
        base_url = result['data']['videoList'][0]['url']
        
        # 保存缓存
        cache_data = {
            'data': base_url,
            'time': time.time()
        }
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f)
        
        return base_url
    
    def get_stream_m3u8(self, base_url, uid, guid, app_secret):
        """获取最终的M3U8内容"""
        cache_file = os.path.join(self.cache_dir, f"stream_url_{hashlib.md5((uid + base_url).encode()).hexdigest()}.json")
        
        # 检查缓存
        stream_url = ''
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                cache_age = time.time() - cache_data.get('time', 0)
                if cache_age < 120:  # 2分钟缓存
                    stream_url = cache_data['data']
            except:
                pass
        
        if not stream_url:
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
            
            # 重试机制
            for retry in range(2):
                try:
                    response = self.http_post('https://ytpvdn.cctv.cn/cctvmobileinf/rest/cctv/videoliveUrl/getstream', 
                                            urllib.parse.urlencode(data), headers)
                    result = json.loads(response)
                    stream_url = result['url']
                    break
                except Exception as e:
                    if retry == 1:
                        raise e
                    time.sleep(0.5)
            
            # 保存缓存
            cache_data = {
                'data': stream_url,
                'time': time.time()
            }
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f)
        
        # 获取原始M3U8内容
        headers = {
            'User-Agent': self.UA,
            'Referer': self.REFERER,
            'UID': uid,
        }
        
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
        """获取TS文件内容"""
        ts_file = params.get('ts', '')
        ws_secret = params.get('wsSecret', '')
        ws_time = params.get('wsTime', '')
        
        if not ts_file:
            return [400, "text/plain", "Missing ts parameter"]
        
        uid = self.default_uid
        
        ts_url = f"http://liveali-tpgq.cctv.cn/live/{ts_file}?wsSecret={ws_secret}&wsTime={ws_time}"
        
        headers = {
            "User-Agent": self.UA,
            "Referer": self.REFERER,
            "UID": uid,
            "Accept": "*/*",
        }
        
        try:
            if self.is_proxy:
                response = requests.get(ts_url, headers=headers, proxies=self.proxy, stream=True)
            else:
                response = requests.get(ts_url, headers=headers, stream=True)
            
            content = b""
            for chunk in response.iter_content(chunk_size=8192):
                content += chunk
                
            return [200, "video/MP2T", content]
            
        except Exception as e:
            return [500, "text/plain", str(e)]
    
    def http_post(self, url, data, headers):
        """发送POST请求"""
        try:
            if self.is_proxy:
                response = requests.post(url, data=data, headers=headers, proxies=self.proxy, timeout=15)
            else:
                response = requests.post(url, data=data, headers=headers, timeout=15)
            return response.text
        except Exception as e:
            raise Exception(f"HTTP请求失败: {str(e)}")
    
    def b64encode(self, data):
        return base64.b64encode(data.encode('utf-8')).decode('utf-8')
    
    def b64decode(self, data):
        return base64.b64decode(data.encode('utf-8')).decode('utf-8')

    def liveContent(self, url):
        """生成CCTV频道列表的M3U8内容"""
        tv_list = ['#EXTM3U']
        for name, live_id in self.cctv_list.items():
            tv_list.append(f'#EXTINF:-1 tvg-id="{name}" tvg-name="CCTV {name[3:]}" group-title="CCTV",{name.upper()}')
            tv_list.append(f'{self.getProxyUrl()}&fun=cctv&pid={live_id}')
        return '\n'.join(tv_list)

# 测试代码
if __name__ == '__main__':
    # 创建测试实例
    spider = Spider()
    spider.init('{}')
    
    # 测试获取CCTV1直播
    print("测试获取CCTV1直播...")
    try:
        result = spider.fun_cctv({'pid': spider.cctv_list['cctv1']})
        if result[0] == 200:
            print("获取成功!")
            # 保存测试文件
            with open('test_cctv1.m3u8', 'w', encoding='utf-8') as f:
                f.write(result[2])
            print("M3U8文件已保存为 test_cctv1.m3u8")
        else:
            print(f"获取失败: {result[2]}")
    except Exception as e:
        print(f"测试失败: {e}")
