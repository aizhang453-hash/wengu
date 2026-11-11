// 每天是农历几月几日、节气是哪天: tools/lunar-days.mjs 从香港天文台的「公历与农历日期对照表」生成, 别手改。用法见 js/lunar.js
// MONTHS 一个字一个农历月, 从 START (那个月的初一, 11 月) 起接着排: s 小月 (29 天)、l 大月 (30 天), 大写的是闰月 (月份跟上一个月一样)
// TERMS 一年一行, 24 个节气 (小寒、大寒……冬至) 各是那个月的几号 (a 是 1 号, b 是 2 号……; 小寒、大寒在 1 月, 立春、雨水在 2 月……)
export const START = '1999-12-08';
export const START_MONTH = 11;
export const MONTHS =
  'lsllsslsslsllsllslSlsslslslllslslsslslsllsllslsslslslSllslslslslslslsllslslslslslslSllsllsslsslsllls' +
  'llsslsslsllslllsslSslslslllslslsslslsllsllslsslslslsllSlslslslslslsllslslslslslslsllSlslslsslslllsls' +
  'lslsslsllsllslslssLslslllslslsslslslllslslsslssllslllSlsslslslsllslslslslslslsllslslslslSsllsllslsls' +
  'lsslsllsllslslsslSlslllslslsslsslllsllslsslssllslllslSslssllsllslslslssllslsllslslslssllSlsllslslsls' +
  'slsllsllslslsslslslllSlslsslslsllsllslsslssllslllslssLsslsllllslsslsslslllslslslsslsllsllSlslslsslsl' +
  'lslsllslsslslsllsllslslSslslsllsllslsslssllslllslsslsSlsllllslsslsslslllslslslsslsllsllsLslsslslslls' +
  'llslsslslslsllsllslsslsLslsllsllslsslssllslllslsslsslSllllslsslsslslllsllsslsslsllsllslsLsslslslllsl' +
  'slsslslsllslslslslslslsLsllsllsslslslslslllslsslsslslllsllsSlsslslllsllsslsslsllsllslslsSlslslllslsl' +
  'sslslsllsllslsslslslsllSlslslslslslsllslslslslssllsllslslslSslslllslslslsslsllsllslslsslSlslllslslss' +
  'lslsllsllslsslslslsllslSlslslslslsllslslslslslslsllslslslsSlslllslslslsslsllsllslslsslslslllslSlssls' +
  'slllsllslsslssllslllsslSlssllsllslslslslslslsllslslslslsslLsllslslslsslsllsllslslsslslslllslslSslssl' +
  'llsllslssslsllslllslsslSsllsllslslslsslsllsllslslslssllslsLlslslsslslsllsllslslsslslslllslslsSlsslll' +
  'sllslssslsllslllslssslslslllSllsslsslslllslslslssl';
export const TERM_NAMES = ["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"];
export const FIRST_YEAR = 2000;
export const TERMS = [
  'fudsetdteueugvgwgwhwgvgu', // 2000
  'etdreteteueugwgwgwhwgvgv', // 2001
  'etdsfuetfufugwhwhwhwgvgv', // 2002
  'ftdsfuetfufvgwhwhwixhwgv', // 2003
  'fudsetdteueugvgwgwhwgvgu', // 2004
  'etdreteteueugwgwgwhwgvgv', // 2005
  'etdsfueteufugwgwhwhwgvgv', // 2006
  'ftdsfuetfufvgwhwhwixhwgv', // 2007
  'fudsetdteueugvgwgvhwgvgu', // 2008
  'etdretdteueugwgwgwhwgvgv', // 2009
  'etdsfueteufugwgwhwhwgvgv', // 2010
  'ftdsfuetfufvgwhwhwhxhwgv', // 2011
  'fudsetdteteugvgwgvhwgvgu', // 2012
  'etdretdteueugvgwgwhwgvgv', // 2013
  'etdsfueteufugwgwhwhwgvgv', // 2014
  'ftdsfuetfufvgwhwhwhxhvgv', // 2015
  'ftdsetdseteugvgwgvhwgvgu', // 2016
  'etcretdteueugvgwgwhwgvgv', // 2017
  'etdseueteufugwgwhwhwgvgv', // 2018
  'etdsfuetfufugwhwhwhxhvgv', // 2019
  'ftdsetdseteufvgvgvhwgvgu', // 2020
  'etcretdteueugvgwgwhwgvgu', // 2021
  'etdseteteufugwgwgwhwgvgv', // 2022
  'etdsfuetfufugwhwhwhxhvgv', // 2023
  'ftdsetdseteufvgvgvhwgvfu', // 2024
  'etcretdteueugvgwgwhwgvgu', // 2025
  'etdreteteueugwgwgwhwgvgv', // 2026
  'etdsfuetfufugwhwhwhwgvgv', // 2027
  'ftdsetdseteufvgvgvhwgvfu', // 2028
  'etcretdteueugvgwgwhwgvgu', // 2029
  'etdreteteueugwgwgwhwgvgv', // 2030
  'etdsfuetfufugwhwhwhwgvgv', // 2031
  'ftdsetdseteufvgvgvhwgvfu', // 2032
  'etcretdteueugvgwgwhwgvgu', // 2033
  'etdreteteueugwgwgwhwgvgv', // 2034
  'etdsfueteufugwgwhwhwgvgv', // 2035
  'ftdsetdseteufvgvgvhwgvfu', // 2036
  'etcretdteueugvgwgwhwgvgu', // 2037
  'etdreteteueugwgwgwhwgvgv', // 2038
  'etdsfueteufugwgwhwhwgvgv', // 2039
  'ftdsetdseteufvgvgvhwgvfu', // 2040
  'etcretdteteugvgwgvhwgvgu', // 2041
  'etdretdteueugwgwgwhwgvgv', // 2042
  'etdsfueteufugwgwhwhwgvgv', // 2043
  'ftdsetdseteufvgvgvgwgvfu', // 2044
  'etcretdseteugvgwgvhwgvgu', // 2045
  'etdretdteueugvgwgwhwgvgv', // 2046
  'etdsfueteufugwgwhwhwgvgv', // 2047
  'ftdsetdsetetfvgvgvgwgufu', // 2048
  'escretdseteufvgvgvhwgvgu', // 2049
  'etcretdteueugvgwgwhwgvgv', // 2050
  'etdseteteufugwgwgwhwgvgv', // 2051
  'etdsetdsetetfvgvgvgwgufu', // 2052
  'escretdseteufvgvgvhwgvgu', // 2053
  'etcretdteueugvgwgwhwgvgv', // 2054
  'etdseteteueugwgwgwhwgvgv', // 2055
  'etdsetdsetetfvgvgvgwgufu', // 2056
  'escretdseteufvgvgvhwgvfu', // 2057
  'etcretdteueugvgwgwhwgvgu', // 2058
  'etdseteteueugwgwgwhwgvgv', // 2059
  'etdsetdsetetfvgvgvgvfufu', // 2060
  'escretdseteufvgvgvhwgvfu', // 2061
  'etcretdteueugvgwgwhwgvgu', // 2062
  'etdreteteueugwgwgwhwgvgv', // 2063
  'etdsetdsetetfvgvgvgvfufu', // 2064
  'escretdseteufvgvgvhwgvfu', // 2065
  'etcretdteueugvgwgwhwgvgu', // 2066
  'etdreteteueugwgwgwhwgvgv', // 2067
  'etdsetdsdtetfvfvgvgvfufu', // 2068
  'escretdseteufvgvgvhwgvfu', // 2069
  'etcretdteteugvgwgvhwgvgu', // 2070
  'etdreteteueugwgwgwhwgvgv', // 2071
  'etdsetdsdtetfvfvgvgvfufu', // 2072
  'escretdseteufvgvgvgwgvfu', // 2073
  'etcretdteteugvgwgvhwgvgu', // 2074
  'etdretdteueugvgwgwhwgvgv', // 2075
  'etdsetdsdtetfvfvgvgvfufu', // 2076
  'escretdseteufvgvgvgwgvfu', // 2077
  'etcretdseteufvgwgvhwgvgu', // 2078
  'etdretdteueugvgwgwhwgvgv', // 2079
  'etdsetdsdtetfvfvgvgvfufu', // 2080
  'escretdsetetfvgvgvgwgufu', // 2081
  'etcretdseteufvgvgvhwgvgu', // 2082
  'etcretdteueugvgwgwhwgvgv', // 2083
  'etdsdsdsdtetfvfvfvgvfufu', // 2084
  'dscretdsetetfvgvgvgwgufu', // 2085
  'escretdseteufvgvgvhwgvgu', // 2086
  'etcretdteueugvgwgwhwgvgv', // 2087
  'etdsdsdsdtdtfvfvfvgvfufu', // 2088
  'dscretdsetetfvgvgvgwgufu', // 2089
  'escretdseteufvgvgvhwgvfu', // 2090
  'etcretdteueugvgwgwhwgvgu', // 2091
  'etdsdsdsdtdtfvfvfvgvfufu', // 2092
  'dscretdsetetfvgvgvgvfufu', // 2093
  'escretdseteufvgvgvhwgvfu', // 2094
  'etcretdteueugvgwgwhwgvgu', // 2095
  'etdrdsdsdtdtfvfvfvgvfufu', // 2096
  'dscretdsetetfvfvgvgvfufu', // 2097
  'escretdseteufvgvgvhwgvfu', // 2098
  'etcretdteueugvgwgwhwgvgu', // 2099
  'etdreteteueugwgwgwhwgvgv', // 2100
];
