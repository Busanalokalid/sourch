const phoneFormatter = (number, phoneId = 'id') => {
  // 1. Menghilangkan karakter selain angka
  let formatted = number.replace(/\D/g, '');

  if (formatted.startsWith('0')) {
    if(phoneId == 'id' || phoneId == 'idn'){
      formatted = '62' + formatted.substr(1);
    }
  }

  // mengecheck apakah di blakang ada @c.us jika tidak ada tambahkan @c.us
  if (!formatted.endsWith('@c.us')) {
    formatted += '@c.us';
  }

  return formatted;
}

module.exports = {
  phoneFormatter
}