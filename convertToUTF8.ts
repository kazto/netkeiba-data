import iconv from 'iconv-lite';
const { decode: iconv_decode } = iconv;

export async function convertToUTF8(ab: ArrayBuffer) {
    const buf = Buffer.from(ab);
    const utf8 = iconv_decode(buf, 'euc-jp');
    return utf8;
}
