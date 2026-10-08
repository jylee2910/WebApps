/* 낙서 인식용 단어장 (영어|한국어). Quick, Draw! 범주를 바탕으로 자주 그리는 것 위주. */
SK.LABELS = `
airplane|비행기 apple|사과 axe|도끼 banana|바나나 bear|곰 bee|벌 bicycle|자전거 bird|새 book|책 bread|빵
bridge|다리 broom|빗자루 bucket|양동이 bus|버스 butterfly|나비 cactus|선인장 cake|케이크 camera|카메라 candle|양초 car|자동차
carrot|당근 castle|성 cat|고양이 chair|의자 cloud|구름 coffee cup|커피잔 crab|게 crown|왕관 cow|소 dog|개
dolphin|돌고래 donut|도넛 dragon|용 duck|오리 ear|귀 elephant|코끼리 eye|눈 face|얼굴 fish|물고기 flower|꽃
frog|개구리 giraffe|기린 glasses|안경 guitar|기타 hamburger|햄버거 hand|손 hat|모자 heart|하트 helicopter|헬리콥터 horse|말
hot air balloon|열기구 house|집 ice cream|아이스크림 key|열쇠 ladder|사다리 leaf|나뭇잎 light bulb|전구 lightning|번개 lion|사자 lollipop|막대사탕
moon|달 mountain|산 mouse|쥐 mushroom|버섯 octopus|문어 owl|부엉이 palm tree|야자수 panda|판다 pear|배 pencil|연필
penguin|펭귄 piano|피아노 pig|돼지 pineapple|파인애플 pizza|피자 rabbit|토끼 rainbow|무지개 river|강 robot|로봇 rocket|로켓
rose|장미 sailboat|돛단배 scissors|가위 shark|상어 sheep|양 shoe|신발 skull|해골 snail|달팽이 snake|뱀 snowman|눈사람
spider|거미 star|별 strawberry|딸기 sun|해 sword|칼 table|탁자 teapot|찻주전자 tent|텐트 tiger|호랑이 tooth|이빨
tornado|토네이도 tractor|트랙터 train|기차 tree|나무 truck|트럭 umbrella|우산 watermelon|수박 whale|고래 windmill|풍차 wine glass|와인잔
zebra|얼룩말 ant|개미 bat|박쥐 bed|침대 bell|종 bench|벤치 binoculars|쌍안경 birthday cake|생일 케이크 boat|배 bowtie|나비넥타이
camel|낙타 campfire|모닥불 cherry|체리 church|교회 clock|시계 computer|컴퓨터 cookie|쿠키 crocodile|악어 cup|컵 diamond|다이아몬드
door|문 dumbbell|아령 envelope|봉투 feather|깃털 fire truck|소방차 flamingo|홍학 fork|포크 grapes|포도 hedgehog|고슴도치 hot dog|핫도그
kangaroo|캥거루 knife|칼 lighthouse|등대 lobster|바닷가재 map|지도 mermaid|인어 monkey|원숭이 motorbike|오토바이 ocean|바다 parrot|앵무새
peanut|땅콩 phone|전화기 raccoon|너구리 sandwich|샌드위치 saxophone|색소폰 school bus|스쿨버스 sea turtle|바다거북 squirrel|다람쥐 stairs|계단 submarine|잠수함
sunflower|해바라기 swan|백조 teddy bear|곰인형 television|텔레비전 toothbrush|칫솔 traffic light|신호등 violin|바이올린 volcano|화산 waterfall|폭포 wheel|바퀴
person|사람 girl|소녀 boy|소년 baby|아기 cityscape|도시 풍경 landscape|풍경 portrait|초상화 skyscraper|고층 빌딩 road|길 garden|정원
`.match(/[a-z][a-z ]*\|[^a-z|]+/g).map((s) => {
  const [en, ko] = s.split('|');
  return { en: en.trim(), ko: ko.trim() };
});
